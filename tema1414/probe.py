#!/usr/bin/env python3
"""Fase 0 - sondagem descartável (Tema 1414/STJ).

Rode NA SUA MÁQUINA (IP brasileiro). Não interpreta nada: só testa se cada fonte
responde com o conteúdo esperado e imprime uma tabela.

Uso:
    pip install playwright          # não precisa 'playwright install': usa o Chrome do sistema
    python3 probe.py                # sondagem completa
    python3 probe.py --manual       # abre o Chrome no perfil dedicado e espera você navegar (aquece o perfil)

Saída também gravada em ~/.tema1414/probe-out/ (JSON + screenshots).
"""
import argparse, json, os, platform, sys, time, urllib.request, urllib.error, urllib.parse
from datetime import date, timedelta, datetime
from pathlib import Path

HOME = Path.home() / ".tema1414"
PROFILE = HOME / "chrome-profile"
OUT = HOME / "probe-out"

NUMERO_DJEN = "2245437"          # REsp 2.245.437/MG
REGISTRO = "202504559893"        # 2025/0455989-3
URL_TEMA = ("https://processo.stj.jus.br/repetitivos/temas_repetitivos/pesquisa.jsp"
            "?novaConsulta=true&tipo_pesquisa=T&cod_tema_inicial=1414&cod_tema_final=1414")
URL_PROC = ("https://processo.stj.jus.br/processo/pesquisa/?tipoPesquisa="
            "tipoPesquisaNumeroRegistro&termo=%s&aplicacao=processos.ea" % REGISTRO)
# Chave pública do CNJ (datajud-wiki.cnj.jus.br/api-publica/acesso). Se der 401/403, pode ter sido rotacionada.
DATAJUD_KEY = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="
DATAJUD_URL = "https://api-publica.datajud.cnj.jus.br/api_publica_stj/_search"
DESAFIO = ("verificação automática", "verificacao automatica", "csid")

rows = []  # (fonte, status, veredito, detalhe)


def add(fonte, status, ok, detalhe):
    rows.append((fonte, str(status), "ACESSÍVEL" if ok else "INACESSÍVEL", detalhe))
    print(f"[{'OK ' if ok else 'FALHA'}] {fonte}: {status} - {detalhe}", flush=True)


def http(url, data=None, headers=None, timeout=30):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return None, f"{type(e).__name__}: {e}"


def snippet(s, n=300):
    return " ".join((s or "").split())[:n]


def env_info():
    print("== Ambiente ==")
    print("SO:", platform.platform())
    print("Fuso do sistema:", time.tzname, "| agora:", datetime.now().astimezone().isoformat())
    print("Python:", sys.version.split()[0])
    try:
        import playwright, importlib.metadata as md
        print("Playwright:", md.version("playwright"))
    except Exception as e:
        print("Playwright: NÃO instalado (", e, ")")
    st, body = http("https://ipinfo.io/json", timeout=10)
    try:
        j = json.loads(body)
        print("IP público (país/região):", j.get("country"), j.get("region"), "-", j.get("org"))
    except Exception:
        print("IP público: não consegui determinar:", snippet(body, 100))
    for p in ["/Applications/Google Chrome.app", "/usr/bin/google-chrome",
              r"C:\Program Files\Google\Chrome\Application\chrome.exe"]:
        if os.path.exists(p):
            print("Chrome do sistema encontrado em:", p)
    print()


def probe_djen():
    fim = date.today(); ini = fim - timedelta(days=10)
    q = urllib.parse.urlencode({"siglaTribunal": "STJ", "texto": NUMERO_DJEN,
                                "dataDisponibilizacaoInicio": ini.isoformat(),
                                "dataDisponibilizacaoFim": fim.isoformat(), "itensPorPagina": 100})
    url = "https://comunicaapi.pje.jus.br/api/v1/comunicacao?" + q
    st, body = http(url, headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"})
    ok = False; det = snippet(body)
    if st == 200:
        try:
            j = json.loads(body)
            ok = isinstance(j, dict)
            det = f"JSON válido; chaves={list(j)[:6]}; count={j.get('count')}; itens={len(j.get('items', []))}"
        except Exception:
            det = "200 mas corpo não é JSON: " + det
    add("DJEN", st, ok, det)


def probe_datajud():
    body = json.dumps({"size": 1, "query": {"match_all": {}}}).encode()
    st, resp = http(DATAJUD_URL, data=body, headers={
        "Authorization": "APIKey " + DATAJUD_KEY, "Content-Type": "application/json"})
    ok = False; det = snippet(resp)
    if st == 200:
        try:
            j = json.loads(resp)
            ok = "hits" in j
            det = f"JSON válido; total hits={j.get('hits', {}).get('total')}"
        except Exception:
            pass
    add("DataJud", st, ok, det + ("" if st == 200 else "  (chave pode ter sido rotacionada: confira a wiki do CNJ)"))


def eh_desafio(txt):
    t = (txt or "").lower()
    return any(k in t for k in DESAFIO)


def esperar_liberar(page, esperado, max_s=60):
    """Faz polling até sair do desafio E aparecer algum dos textos esperados."""
    t0 = time.time()
    while time.time() - t0 < max_s:
        try:
            txt = page.inner_text("body", timeout=3000)
        except Exception:
            txt = ""
        low = txt.lower()
        if txt and not eh_desafio(txt) and any(e in low for e in esperado):
            return True, int(time.time() - t0), txt
        time.sleep(2)
    try:
        txt = page.inner_text("body", timeout=3000)
    except Exception:
        txt = ""
    return False, int(time.time() - t0), txt


def launch(pw):
    PROFILE.mkdir(parents=True, exist_ok=True)
    return pw.chromium.launch_persistent_context(
        str(PROFILE), channel="chrome", headless=False, locale="pt-BR",
        timezone_id="America/Sao_Paulo", viewport={"width": 1280, "height": 900})


def probe_stj():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        add("STJ (Tema)", "-", False, "playwright não instalado: pip install playwright"); return
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        try:
            ctx = launch(pw)
        except Exception as e:
            add("STJ (Tema)", "-", False, "não abriu o Chrome do sistema: " + snippet(str(e), 200)
                + " (feche qualquer Chrome que use ~/.tema1414/chrome-profile)")
            return
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        for nome, url, esp, shot in [
            ("STJ (Tema)", URL_TEMA, ["1414", "tema"], "tema.png"),
            ("STJ (Consulta)", URL_PROC, ["última fase", "ultima fase"], "consulta.png"),
        ]:
            st = None
            try:
                resp = page.goto(url, wait_until="domcontentloaded", timeout=60000)
                st = resp.status if resp else None
            except Exception as e:
                add(nome, "-", False, "erro de navegação: " + snippet(str(e), 200)); continue
            ok, seg, txt = esperar_liberar(page, esp)
            try:
                page.screenshot(path=str(OUT / shot))
            except Exception:
                pass
            if ok:
                add(nome, st, True, f"conteúdo esperado lido após {seg}s: " + snippet(txt, 200))
            elif eh_desafio(txt):
                add(nome, st, False, f"DESAFIO NÃO PASSOU em {seg}s: " + snippet(txt, 150))
            else:
                add(nome, st, False, f"sem o conteúdo esperado após {seg}s: " + snippet(txt, 200))
            time.sleep(5)  # pausa entre consultas ao STJ
        ctx.close()


def manual():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        ctx = launch(pw)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(URL_TEMA)
        input("Chrome aberto no perfil dedicado. Navegue (Tema, uma consulta processual), "
              "espere o desafio passar e ENTER aqui para fechar...")
        ctx.close()


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--manual", action="store_true")
    a = ap.parse_args()
    if a.manual:
        return manual()
    env_info()
    print("== Sondagem ==")
    probe_djen(); probe_datajud(); probe_stj()
    print("\n| Fonte | Status | Veredito | Detalhe |\n|---|---|---|---|")
    for r in rows:
        print("| " + " | ".join(c.replace("|", "/") for c in r) + " |")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "probe.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), "utf-8")
    print(f"\nGravado em {OUT}. Cole aqui a saída acima.")


if __name__ == "__main__":
    main()
