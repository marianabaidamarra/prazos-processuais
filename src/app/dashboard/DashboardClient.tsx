"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { classificarUrgencia, type UrgenciaPrazo } from "@/lib/prazos";

interface PrazoSerializado {
  id: string;
  tipo: string;
  descricao: string | null;
  dataIntimacao: string;
  diasPrazo: number;
  contagemEmDiasUteis: boolean;
  dataFinal: string;
  status: string;
  observacoes: string | null;
}

interface ProcessoSerializado {
  id: string;
  numeroCnj: string;
  tribunal: string | null;
  vara: string | null;
  partes: string | null;
  status: string;
  fonteMonitoramento: string;
  prazos: PrazoSerializado[];
}

const URGENCIA_ESTILO: Record<UrgenciaPrazo, { label: string; classe: string }> = {
  vencido: { label: "VENCIDO", classe: "bg-red-100 text-red-800 border-red-300" },
  hoje: { label: "VENCE HOJE", classe: "bg-red-100 text-red-800 border-red-300" },
  critico: { label: "Crítico (≤2 dias)", classe: "bg-orange-100 text-orange-800 border-orange-300" },
  atencao: { label: "Atenção (≤7 dias)", classe: "bg-amber-100 text-amber-800 border-amber-300" },
  tranquilo: { label: "Tranquilo", classe: "bg-green-100 text-green-800 border-green-300" },
};

const TIPOS_PRAZO = [
  { value: "contestacao", label: "Contestação" },
  { value: "recurso", label: "Recurso" },
  { value: "embargos", label: "Embargos" },
  { value: "manifestacao", label: "Manifestação" },
  { value: "outro", label: "Outro" },
];

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function DashboardClient({
  userEmail,
  processosIniciais,
}: {
  userEmail: string;
  processosIniciais: ProcessoSerializado[];
}) {
  const router = useRouter();
  const [processos] = useState(processosIniciais);
  const [mostrarFormProcesso, setMostrarFormProcesso] = useState(false);
  const [processoParaPrazo, setProcessoParaPrazo] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const todosPrazosPendentes = useMemo(() => {
    return processos
      .flatMap((p) => p.prazos.filter((pr) => pr.status === "pendente").map((pr) => ({ ...pr, processo: p })))
      .sort((a, b) => new Date(a.dataFinal).getTime() - new Date(b.dataFinal).getTime());
  }, [processos]);

  const resumo = useMemo(() => {
    const contagem: Record<UrgenciaPrazo, number> = {
      vencido: 0,
      hoje: 0,
      critico: 0,
      atencao: 0,
      tranquilo: 0,
    };
    for (const p of todosPrazosPendentes) {
      contagem[classificarUrgencia(new Date(p.dataFinal))]++;
    }
    return contagem;
  }, [todosPrazosPendentes]);

  async function criarProcesso(formData: FormData) {
    setCarregando(true);
    setMensagem(null);
    const resp = await fetch("/api/processos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        numeroCnj: formData.get("numeroCnj"),
        tribunal: formData.get("tribunal") || undefined,
        vara: formData.get("vara") || undefined,
        partes: formData.get("partes") || undefined,
        monitorarViaEscavador: formData.get("monitorar") === "on",
      }),
    });
    const dados = await resp.json();
    setCarregando(false);
    if (!resp.ok) {
      setMensagem(`Erro: ${JSON.stringify(dados.erro)}`);
      return;
    }
    if (dados.aviso) setMensagem(dados.aviso);
    setMostrarFormProcesso(false);
    router.refresh();
  }

  async function criarPrazo(processId: string, formData: FormData) {
    setCarregando(true);
    setMensagem(null);
    const resp = await fetch("/api/prazos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        processId,
        tipo: formData.get("tipo"),
        descricao: formData.get("descricao") || undefined,
        dataIntimacao: formData.get("dataIntimacao"),
        diasPrazo: Number(formData.get("diasPrazo")),
        contagemEmDiasUteis: formData.get("contagemEmDiasUteis") === "on",
      }),
    });
    const dados = await resp.json();
    setCarregando(false);
    if (!resp.ok) {
      setMensagem(`Erro: ${JSON.stringify(dados.erro)}`);
      return;
    }
    setProcessoParaPrazo(null);
    router.refresh();
  }

  async function atualizarStatusPrazo(prazoId: string, status: string) {
    setCarregando(true);
    await fetch(`/api/prazos/${prazoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setCarregando(false);
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">Prazos Processuais</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-500">{userEmail}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {mensagem && (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            {mensagem}
          </div>
        )}

        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(Object.keys(URGENCIA_ESTILO) as UrgenciaPrazo[]).map((u) => (
            <div key={u} className={`rounded-lg border px-4 py-3 ${URGENCIA_ESTILO[u].classe}`}>
              <div className="text-2xl font-bold">{resumo[u]}</div>
              <div className="text-xs">{URGENCIA_ESTILO[u].label}</div>
            </div>
          ))}
        </section>

        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900">Próximos prazos</h2>
          </div>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            {todosPrazosPendentes.length === 0 ? (
              <p className="px-4 py-6 text-sm text-zinc-500">Nenhum prazo pendente cadastrado ainda.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-4 py-2">Processo</th>
                    <th className="px-4 py-2">Tipo</th>
                    <th className="px-4 py-2">Vencimento</th>
                    <th className="px-4 py-2">Urgência</th>
                    <th className="px-4 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {todosPrazosPendentes.map((prazo) => {
                    const urgencia = classificarUrgencia(new Date(prazo.dataFinal));
                    return (
                      <tr key={prazo.id} className="border-t border-zinc-100">
                        <td className="px-4 py-3 font-mono text-xs">{prazo.processo.numeroCnj}</td>
                        <td className="px-4 py-3">{prazo.tipo}</td>
                        <td className="px-4 py-3">{formatarData(prazo.dataFinal)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${URGENCIA_ESTILO[urgencia].classe}`}
                          >
                            {URGENCIA_ESTILO[urgencia].label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            disabled={carregando}
                            onClick={() => atualizarStatusPrazo(prazo.id, "cumprido")}
                            className="mr-2 text-xs font-medium text-green-700 hover:underline"
                          >
                            Marcar cumprido
                          </button>
                          <button
                            disabled={carregando}
                            onClick={() => atualizarStatusPrazo(prazo.id, "cancelado")}
                            className="text-xs font-medium text-zinc-500 hover:underline"
                          >
                            Cancelar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900">Processos cadastrados</h2>
            <button
              onClick={() => setMostrarFormProcesso((v) => !v)}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              {mostrarFormProcesso ? "Cancelar" : "+ Novo processo"}
            </button>
          </div>

          {mostrarFormProcesso && (
            <form
              action={criarProcesso}
              className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:grid-cols-2"
            >
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-zinc-700">
                  Número CNJ (ex: 0000000-00.0000.0.00.0000)
                </label>
                <input
                  name="numeroCnj"
                  required
                  className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Tribunal</label>
                <input name="tribunal" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Vara</label>
                <input name="vara" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-zinc-700">Partes</label>
                <input name="partes" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <input type="checkbox" name="monitorar" id="monitorar" className="h-4 w-4" />
                <label htmlFor="monitorar" className="text-sm text-zinc-700">
                  Monitorar automaticamente via Escavador (requer API configurada)
                </label>
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={carregando}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                >
                  Salvar processo
                </button>
              </div>
            </form>
          )}

          <div className="flex flex-col gap-3">
            {processos.map((processo) => (
              <div key={processo.id} className="rounded-lg border border-zinc-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-sm text-zinc-900">{processo.numeroCnj}</div>
                    <div className="text-xs text-zinc-500">
                      {[processo.tribunal, processo.vara, processo.partes].filter(Boolean).join(" · ") ||
                        "Sem detalhes adicionais"}
                      {processo.fonteMonitoramento === "escavador" && (
                        <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">
                          monitorado via Escavador
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setProcessoParaPrazo(processoParaPrazo === processo.id ? null : processo.id)
                    }
                    className="text-xs font-medium text-zinc-700 hover:underline"
                  >
                    {processoParaPrazo === processo.id ? "Cancelar" : "+ Adicionar prazo"}
                  </button>
                </div>

                {processoParaPrazo === processo.id && (
                  <form
                    action={(fd) => criarPrazo(processo.id, fd)}
                    className="mt-3 grid grid-cols-1 gap-3 rounded-md border border-zinc-100 bg-zinc-50 p-3 sm:grid-cols-2"
                  >
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-700">Tipo</label>
                      <select name="tipo" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
                        {TIPOS_PRAZO.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-700">Dias de prazo</label>
                      <input
                        type="number"
                        name="diasPrazo"
                        min={1}
                        required
                        className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-700">
                        Data da intimação/publicação
                      </label>
                      <input
                        type="date"
                        name="dataIntimacao"
                        required
                        className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-5">
                      <input
                        type="checkbox"
                        name="contagemEmDiasUteis"
                        id={`dias-uteis-${processo.id}`}
                        defaultChecked
                        className="h-4 w-4"
                      />
                      <label htmlFor={`dias-uteis-${processo.id}`} className="text-sm text-zinc-700">
                        Contar em dias úteis (padrão CPC art. 219)
                      </label>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-zinc-700">
                        Descrição (opcional)
                      </label>
                      <input
                        name="descricao"
                        className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        disabled={carregando}
                        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                      >
                        Calcular e salvar prazo
                      </button>
                    </div>
                  </form>
                )}

                {processo.prazos.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1 text-xs text-zinc-600">
                    {processo.prazos.map((pr) => (
                      <li key={pr.id} className="flex items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 ${
                            URGENCIA_ESTILO[
                              pr.status === "pendente" ? classificarUrgencia(new Date(pr.dataFinal)) : "tranquilo"
                            ].classe
                          }`}
                        >
                          {pr.status === "pendente" ? formatarData(pr.dataFinal) : pr.status}
                        </span>
                        <span>{pr.tipo}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {processos.length === 0 && (
              <p className="text-sm text-zinc-500">Nenhum processo cadastrado ainda.</p>
            )}
          </div>
        </section>

        <p className="mt-10 text-xs text-zinc-400">
          Cálculo de prazos considera feriados nacionais e recesso forense (20/dez–20/jan). Feriados
          estaduais/locais do tribunal específico não são conhecidos automaticamente — confira prazos
          críticos manualmente.
        </p>
      </main>
    </div>
  );
}
