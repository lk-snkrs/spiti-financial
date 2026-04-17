import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency, getStatusColor } from '../lib/financeiro'

function ModalReceber({ parcela, cobranca, onClose, onSave }) {
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().split('T')[0])
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleConfirmar() {
    setSaving(true)
    
    // Marcar parcela como paga
    await supabase.from('spiti_parcelas').update({
      status: 'pago',
      data_pagamento: dataPagamento,
      notas
    }).eq('id', parcela.id)

    // Atualizar valor_pago na cobrança
    const { data: todasParcelas } = await supabase.from('spiti_parcelas')
      .select('valor, status')
      .eq('cobranca_id', cobranca.id)
    
    const valorPago = todasParcelas?.filter(p => p.status === 'pago' || p.id === parcela.id)
      .reduce((sum, p) => sum + (p.valor || 0), 0) || parcela.valor

    const todasPagas = todasParcelas?.every(p => p.status === 'pago' || p.id === parcela.id)

    await supabase.from('spiti_cobrancas').update({
      valor_pago: valorPago,
      status: todasPagas ? 'pago' : 'parcial'
    }).eq('id', cobranca.id)

    onSave(); onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-modal animate-slide-up">
        <h3 className="text-white font-semibold mb-0.5">Confirmar Recebimento</h3>
        <p className="text-gray-500 text-xs mb-4">
          {cobranca.comprador_nome} • Parcela {parcela.numero}/{cobranca.num_parcelas}
        </p>

        <div className="bg-white/5 border border-gold/20 rounded-lg p-4 mb-4">
          <div className="flex justify-between mb-2">
            <span className="text-gray-400">Valor da Parcela:</span>
            <span className="text-gold font-mono font-bold text-lg">{formatCurrency(parcela.valor)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Forma: {parcela.forma_pagamento}</span>
            <span className="text-gray-500">Venc: {parcela.data_vencimento}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Data do Pagamento</label>
            <input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)}
              className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Notas</label>
            <input value={notas} onChange={e => setNotas(e.target.value)}
              className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50"
              placeholder="Comprovante, número do cheque..." />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={handleConfirmar} disabled={saving}
            className="flex-1 bg-gold text-black font-semibold py-2.5 rounded-xl text-sm hover:bg-gold-light transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : '✓ Confirmar Recebimento'}
          </button>
          <button onClick={onClose} className="flex-1 border border-border text-gray-300 py-2.5 rounded-xl text-sm hover:bg-white/5 transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ContasReceber() {
  const [cobrancas, setCobrancas] = useState([])
  const [parcelas, setParcelas] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [modal, setModal] = useState(null)

  async function load() {
    const [{ data: cobrancasData }, { data: parcelasData }] = await Promise.all([
      supabase.from('spiti_cobrancas').select('*').eq('leilao_id', 'spiti9').eq('lancado', true).order('valor_total', { ascending: false }),
      supabase.from('spiti_parcelas').select('*').order('numero')
    ])
    setCobrancas(cobrancasData || [])
    setParcelas(parcelasData || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = cobrancas.filter(c => {
    if (filtro !== 'todos' && c.status !== filtro) return false
    if (busca && !c.comprador_nome?.toLowerCase().includes(busca.toLowerCase())) return false
    return true
  })

  const totais = cobrancas.reduce((acc, c) => {
    acc.total += c.valor_total || 0
    acc.recebido += c.valor_pago || 0
    acc.pendente += Math.max(0, (c.valor_total || 0) - (c.valor_pago || 0))
    return acc
  }, { total: 0, recebido: 0, pendente: 0 })

  function getParcelasByCobranca(cobrancaId) {
    return parcelas.filter(p => p.cobranca_id === cobrancaId)
  }

  if (loading) {
    return <div className="text-gray-500 text-center py-20">Carregando...</div>
  }

  if (cobrancas.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">Contas a Receber</h1>
          <p className="text-gray-500 text-sm">Cobranças dos compradores</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <div className="text-4xl mb-4">📋</div>
          <div className="text-gray-400 mb-2">Nenhuma cobrança lançada ainda</div>
          <p className="text-gray-600 text-sm">
            Vá em <span className="text-gold">Vendas</span> e clique em "Lançar" para gerar cobranças.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Contas a Receber</h1>
        <p className="text-gray-500 text-sm">Cobranças por comprador com parcelas</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: 'Total a Cobrar', val: totais.total, color: 'text-gold' },
          { label: 'Recebido', val: totais.recebido, color: 'text-green-400' },
          { label: 'Pendente', val: totais.pendente, color: 'text-yellow-400' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 card-hover">
            <div className="text-xs text-gray-500 mb-1">{s.label}</div>
            <div className={`text-xl font-bold stat-value ${s.color}`}>{formatCurrency(s.val)}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">🔍</span>
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar comprador..."
            className="bg-card border border-border rounded-xl pl-8 pr-4 py-2 text-sm text-white focus:border-gold/50 transition-colors w-60" />
        </div>
        <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
          {['todos', 'pendente', 'parcial', 'pago'].map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filtro === f ? 'bg-gold text-black' : 'text-gray-400 hover:text-white'
              }`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de cobranças */}
      <div className="space-y-3">
        {filtered.map(c => {
          const parcelasCobranca = getParcelasByCobranca(c.id)
          const saldo = (c.valor_total || 0) - (c.valor_pago || 0)
          const isExpanded = expandedId === c.id

          return (
            <div key={c.id} className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Header */}
              <div 
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : c.id)}
              >
                <div className="flex items-center gap-4">
                  <span className="text-gray-600">{isExpanded ? '▼' : '▶'}</span>
                  <div>
                    <div className="text-white font-medium">{c.comprador_nome}</div>
                    <div className="text-xs text-gray-500">
                      {c.lotes?.length || 0} lotes • {parcelasCobranca.length} parcela{parcelasCobranca.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-right">
                    <div className="text-gold font-bold stat-value">{formatCurrency(c.valor_total)}</div>
                    <div className="text-xs text-gray-500">total</div>
                  </div>
                  <div className="text-right">
                    <div className="text-green-400 font-medium stat-value">{formatCurrency(c.valor_pago)}</div>
                    <div className="text-xs text-gray-500">pago</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-medium stat-value ${saldo > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                      {formatCurrency(saldo)}
                    </div>
                    <div className="text-xs text-gray-500">saldo</div>
                  </div>
                  <span className={`badge ${getStatusColor(c.status)}`}>{c.status}</span>
                </div>
              </div>

              {/* Parcelas expandidas */}
              {isExpanded && parcelasCobranca.length > 0 && (
                <div className="border-t border-border bg-dark/50 px-4 py-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500">
                        <th className="text-left pb-2 font-medium">Parcela</th>
                        <th className="text-left pb-2 font-medium">Valor</th>
                        <th className="text-left pb-2 font-medium">Forma</th>
                        <th className="text-left pb-2 font-medium">Vencimento</th>
                        <th className="text-left pb-2 font-medium">Pagamento</th>
                        <th className="text-left pb-2 font-medium">Status</th>
                        <th className="text-left pb-2 font-medium">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parcelasCobranca.map(p => (
                        <tr key={p.id} className="border-t border-border/30">
                          <td className="py-2 text-gray-400">{p.numero}/{parcelasCobranca.length}</td>
                          <td className="py-2 text-white font-mono">{formatCurrency(p.valor)}</td>
                          <td className="py-2 text-gray-400">{p.forma_pagamento}</td>
                          <td className="py-2 text-gray-400 font-mono">{p.data_vencimento || '—'}</td>
                          <td className="py-2 text-gray-400 font-mono">{p.data_pagamento || '—'}</td>
                          <td className="py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              p.status === 'pago' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                            }`}>
                              {p.status === 'pago' ? '✓ Pago' : 'Pendente'}
                            </span>
                          </td>
                          <td className="py-2">
                            {p.status !== 'pago' && (
                              <button onClick={(e) => { e.stopPropagation(); setModal({ parcela: p, cobranca: c }) }}
                                className="text-xs text-gold hover:text-gold-light font-medium">
                                Receber
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Se não tem parcelas cadastradas (cobrança antiga) */}
              {isExpanded && parcelasCobranca.length === 0 && (
                <div className="border-t border-border bg-dark/50 px-4 py-6 text-center text-gray-500 text-sm">
                  Cobrança sem parcelas detalhadas
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="text-xs text-gray-600 text-center">
        {filtered.length} cobrança{filtered.length !== 1 ? 's' : ''} • Clique para expandir parcelas
      </div>

      {modal && <ModalReceber parcela={modal.parcela} cobranca={modal.cobranca} onClose={() => setModal(null)} onSave={load} />}
    </div>
  )
}
