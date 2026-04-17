import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/financeiro'

function ModalPagarParcelas({ consignante, onClose, onSave }) {
  const [parcelas, setParcelas] = useState([])
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [pagamentosAntigos, setPagamentosAntigos] = useState([])

  // Carregar parcelas existentes e pagamentos antigos
  useEffect(() => {
    async function load() {
      // Buscar registro de pagamento existente
      const { data: pagData } = await supabase
        .from('spiti_pagamentos_consignante')
        .select('*')
        .eq('leilao_id', 'spiti9')
        .eq('consignante_nome', consignante.nome)
        .single()
      
      if (pagData) {
        setPagamentosAntigos(pagData)
        setNotas(pagData.notas || '')
      }

      // Buscar parcelas de pagamento
      const { data: parcData } = await supabase
        .from('spiti_parcelas_pagamento')
        .select('*')
        .eq('leilao_id', 'spiti9')
        .eq('consignante_nome', consignante.nome)
        .order('numero')

      if (parcData && parcData.length > 0) {
        setParcelas(parcData.map(p => ({
          id: p.id,
          valor: p.valor,
          forma: p.forma_pagamento || 'PIX',
          vencimento: p.data_vencimento || '',
          status: p.status || 'pendente',
          dataPagamento: p.data_pagamento
        })))
      } else {
        // Inicializar com parcela única
        const saldo = consignante.valorLiberado - (pagData?.valor_pago || 0)
        setParcelas([{
          valor: Math.max(0, saldo),
          forma: 'PIX',
          vencimento: new Date().toISOString().split('T')[0],
          status: 'pendente'
        }])
      }
    }
    load()
  }, [consignante])

  const totalParcelas = parcelas.reduce((sum, p) => sum + (parseFloat(p.valor) || 0), 0)
  const saldoRestante = consignante.valorLiberado - (pagamentosAntigos?.valor_pago || 0) - totalParcelas
  const diferenca = saldoRestante

  function addParcela() {
    const restante = Math.max(0, diferenca)
    const hoje = new Date()
    hoje.setDate(hoje.getDate() + 30 * parcelas.length)
    setParcelas([...parcelas, {
      valor: restante,
      forma: 'PIX',
      vencimento: hoje.toISOString().split('T')[0],
      status: 'pendente'
    }])
  }

  function updateParcela(idx, field, value) {
    const updated = [...parcelas]
    updated[idx] = { ...updated[idx], [field]: value }
    if (field === 'status' && value === 'pago' && !updated[idx].dataPagamento) {
      updated[idx].dataPagamento = new Date().toISOString().split('T')[0]
    }
    setParcelas(updated)
  }

  function removeParcela(idx) {
    if (parcelas.length <= 1) return
    setParcelas(parcelas.filter((_, i) => i !== idx))
  }

  function distribuirIgual() {
    const valorParcela = diferenca / parcelas.length
    const hoje = new Date()
    setParcelas(parcelas.map((p, i) => {
      const venc = new Date(hoje)
      venc.setDate(venc.getDate() + 30 * i)
      return { ...p, valor: valorParcela, vencimento: venc.toISOString().split('T')[0] }
    }))
  }

  async function handleSalvar() {
    if (Math.abs(diferenca) > 1 && Math.abs(diferenca) > 0.01) {
      alert('A soma das parcelas deve ser igual ao saldo restante!\nDiferença: ' + formatCurrency(diferenca))
      return
    }
    setSaving(true)

    // Atualizar registro principal de pagamento
    const parcelasPagas = parcelas.filter(p => p.status === 'pago')
    const valorJaPago = parcelasPagas.reduce((sum, p) => sum + parseFloat(p.valor || 0), 0)
    const totalPago = (pagamentosAntigos?.valor_pago || 0) + valorJaPago

    const { data: pagto } = await supabase.from('spiti_pagamentos_consignante').upsert({
      id: pagamentosAntigos?.id,
      leilao_id: 'spiti9',
      consignante_nome: consignante.nome,
      lotes_vendidos: consignante.lotesPagos,
      valor_total_arremate: consignante.arremateLiberado,
      total_comissao: consignante.comissaoLiberada,
      valor_a_pagar: consignante.valorLiberado,
      valor_pago: totalPago,
      status: totalPago >= consignante.valorLiberado * 0.99 ? 'pago' : valorJaPago > 0 ? 'parcial' : 'liberado',
      forma_pagamento: parcelas.map(p => p.forma).join(', '),
      num_parcelas: parcelas.length,
      notas: notas
    }, { onConflict: 'id' }).select().single()

    // Salvar parcelas
    if (pagto || pagamentosAntigos?.id) {
      const pgId = pagto?.id || pagamentosAntigos.id
      await supabase.from('spiti_parcelas_pagamento').delete().eq('pagamento_id', pgId)

      const parcelasData = parcelas.map((p, i) => ({
        pagamento_id: pgId,
        leilao_id: 'spiti9',
        consignante_nome: consignante.nome,
        numero: i + 1,
        valor: parseFloat(p.valor),
        forma_pagamento: p.forma,
        data_vencimento: p.vencimento,
        status: p.status || 'pendente',
        data_pagamento: p.dataPagamento
      }))
      await supabase.from('spiti_parcelas_pagamento').insert(parcelasData)
    }

    onSave()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }} className="rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div style={{ background: '#1A1A1A', borderBottom: '1px solid #2A2A2A' }} className="px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Pagar Consignante</h2>
            <p className="text-xs text-gray-500 mt-0.5">{consignante.nome}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
        </div>

        {/* Content */}
        <div style={{ background: '#1A1A1A' }} className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* Resumo */}
          <div style={{ background: '#0A0A0A', border: '1px solid #C9A84C40' }} className="rounded-xl p-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-gray-500 text-xs">Valor Liberado</div>
                <div className="text-white font-mono font-medium">{formatCurrency(consignante.valorLiberado)}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Já Pago (anterior)</div>
                <div className="text-green-400 font-mono">{formatCurrency(pagamentosAntigos?.valor_pago || 0)}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Saldo</div>
                <div className="text-gold font-mono font-bold" style={{ color: '#C9A84C' }}>{formatCurrency(saldoRestante)}</div>
              </div>
            </div>
          </div>

          {/* Parcelas */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Parcelas</h3>
              <div className="flex gap-2">
                <button onClick={distribuirIgual} className="text-xs text-gray-400 hover:text-white px-2 py-1">Distribuir igual</button>
                <button onClick={addParcela} className="text-xs bg-gold/20 text-gold px-2 py-1 rounded hover:bg-gold/30" style={{ color: '#C9A84C' }}>+ Parcela</button>
              </div>
            </div>

            <div style={{ background: '#0A0A0A', border: '1px solid #2A2A2A' }} className="rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500" style={{ borderBottom: '1px solid #2A2A2A' }}>
                    <th className="text-left px-3 py-2 font-medium">#</th>
                    <th className="text-left px-3 py-2 font-medium">Valor</th>
                    <th className="text-left px-3 py-2 font-medium">Forma</th>
                    <th className="text-left px-3 py-2 font-medium">Vencimento</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {parcelas.map((p, idx) => (
                    <tr key={idx} style={{ borderBottom: idx < parcelas.length - 1 ? '1px solid #2A2A2A30' : 'none' }}>
                      <td className="px-3 py-2 text-gray-400 font-mono">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <input type="number" value={p.valor} onChange={e => updateParcela(idx, 'valor', e.target.value)}
                          style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
                          className="w-28 rounded-lg px-2 py-1 text-sm text-white font-mono" />
                      </td>
                      <td className="px-3 py-2">
                        <select value={p.forma} onChange={e => updateParcela(idx, 'forma', e.target.value)}
                          style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
                          className="rounded-lg px-2 py-1 text-sm text-white">
                          {['PIX', 'TED', 'CHEQUE', 'DINHEIRO', 'DOC', 'BOLETO', 'DEPÓSITO'].map(f => <option key={f}>{f}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="date" value={p.vencimento} onChange={e => updateParcela(idx, 'vencimento', e.target.value)}
                          style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
                          className="rounded-lg px-2 py-1 text-sm text-white" />
                      </td>
                      <td className="px-3 py-2">
                        <select value={p.status || 'pendente'} onChange={e => updateParcela(idx, 'status', e.target.value)}
                          className={`rounded-lg px-2 py-1 text-sm cursor-pointer ${
                            p.status === 'pago' ? 'bg-green-500/20 border border-green-500/30 text-green-400' : 'bg-yellow-500/20 border border-yellow-500/30 text-yellow-400'
                          }`}>
                          <option value="pendente">Pendente</option>
                          <option value="pago">✓ Pago</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeParcela(idx)} disabled={parcelas.length <= 1}
                          className="text-red-400 hover:text-red-300 text-xs disabled:opacity-30">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Validação */}
            <div className={`text-xs px-3 py-2 rounded-lg mt-3 ${
              Math.abs(diferenca) < 1 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {Math.abs(diferenca) < 1
                ? `✓ Total: ${formatCurrency(totalParcelas)} (diferença: ${formatCurrency(diferenca)})`
                : `⚠ Diferença de ${formatCurrency(diferenca)} (total parcelas: ${formatCurrency(totalParcelas)})`
              }
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Notas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)}
              style={{ background: '#0A0A0A', border: '1px solid #2A2A2A' }}
              className="w-full rounded-xl px-3 py-2 text-sm text-white resize-none h-16"
              placeholder="Observações..." />
          </div>
        </div>

        {/* Footer */}
        <div style={{ background: '#1A1A1A', borderTop: '1px solid #2A2A2A' }} className="px-6 py-4 flex gap-3">
          <button onClick={handleSalvar} disabled={saving || Math.abs(diferenca) > 1}
            style={{ background: '#C9A84C' }}
            className="flex-1 text-black font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar Parcelas'}
          </button>
          <button onClick={onClose}
            style={{ border: '1px solid #2A2A2A' }}
            className="flex-1 text-gray-300 py-2.5 rounded-xl text-sm hover:bg-white/5">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ContasPagar() {
  const [vendas, setVendas] = useState([])
  const [lotes, setLotes] = useState([])
  const [cobrancas, setCobrancas] = useState([])
  const [pagamentos, setPagamentos] = useState([])
  const [custos, setCustos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [modal, setModal] = useState(null)

  async function load() {
    const [
      { data: vendasData },
      { data: lotesData },
      { data: cobrancasData },
      { data: pagamentosData },
      { data: custosData }
    ] = await Promise.all([
      supabase.from('spiti_vendas').select('*').eq('leilao_id', 'spiti9'),
      supabase.from('spiti_lotes_financeiro').select('*').eq('leilao_id', 'spiti9'),
      supabase.from('spiti_cobrancas').select('*').eq('leilao_id', 'spiti9'),
      supabase.from('spiti_pagamentos_consignante').select('*').eq('leilao_id', 'spiti9'),
      supabase.from('spiti_custos').select('*').eq('leilao_id', 'spiti9')
    ])
    setVendas(vendasData || [])
    setLotes(lotesData || [])
    setCobrancas(cobrancasData || [])
    setPagamentos(pagamentosData || [])
    setCustos(custosData || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Calcular consignantes com status de liberação
  const consignantes = useMemo(() => {
    const map = new Map()

    vendas.forEach(v => {
      const loteInfo = lotes.find(l => l.lote === v.lote)
      const consignante = loteInfo?.consignante || 'Desconhecido'
      const comissaoPct = loteInfo?.comissao_consignante_pct || 10

      if (!map.has(consignante)) {
        map.set(consignante, {
          nome: consignante,
          lotes: [],
          lotesPagos: [],
          lotesPendentes: [],
          arremateTotal: 0,
          arremateLiberado: 0,
          arrematePendente: 0,
          comissaoTotal: 0,
          comissaoLiberada: 0,
          valorTotal: 0,
          valorLiberado: 0,
          valorPendente: 0,
          valorPago: 0,
          status: 'pendente'
        })
      }

      const c = map.get(consignante)
      const comissao = (v.valor_arremate || 0) * (comissaoPct / 100)
      const valorPagar = (v.valor_arremate || 0) - comissao

      // Verificar se comprador já pagou este lote (100% quitado)
      const cobranca = cobrancas.find(cb => cb.lotes?.includes(v.lote))
      const compradorPagou = cobranca?.status === 'pago'

      c.lotes.push({ lote: v.lote, artista: v.artista, arremate: v.valor_arremate, comissao, valorPagar, compradorPagou })
      c.arremateTotal += v.valor_arremate || 0
      c.comissaoTotal += comissao
      c.valorTotal += valorPagar

      if (compradorPagou) {
        c.lotesPagos.push(v.lote)
        c.arremateLiberado += v.valor_arremate || 0
        c.comissaoLiberada += comissao
        c.valorLiberado += valorPagar
      } else {
        c.lotesPendentes.push(v.lote)
        c.arrematePendente += v.valor_arremate || 0
        c.valorPendente += valorPagar
      }
    })

    // Adicionar pagamentos já feitos
    map.forEach((c, nome) => {
      const pag = pagamentos.find(p => p.consignante_nome === nome)
      c.valorPago = pag?.valor_pago || 0
      c.status = c.valorPago >= c.valorLiberado * 0.99 && c.valorLiberado > 0 ? 'pago' 
        : c.valorPago > 0 ? 'parcial' 
        : c.valorLiberado > 0 ? 'liberado' 
        : 'aguardando'
    })

    return Array.from(map.values()).sort((a, b) => b.valorTotal - a.valorTotal)
  }, [vendas, lotes, cobrancas, pagamentos])

  // Reembolso sócios
  const reembolsoSocios = useMemo(() => {
    const socios = {}
    custos.forEach(c => {
      const notas = (c.notas || '').toLowerCase()
      if (notas.includes('zipper')) {
        socios['Zipper'] = (socios['Zipper'] || 0) + c.valor
      } else if (notas.includes('alysson')) {
        socios['Alysson'] = (socios['Alysson'] || 0) + c.valor
      }
    })
    return Object.entries(socios).map(([nome, valor]) => ({ nome, valor }))
  }, [custos])

  const filtered = consignantes.filter(c => {
    if (filtro === 'liberado' && c.valorLiberado <= 0) return false
    if (filtro === 'aguardando' && c.valorLiberado > 0) return false
    if (filtro === 'pago' && c.status !== 'pago') return false
    if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase())) return false
    return true
  })

  const totais = consignantes.reduce((acc, c) => {
    acc.total += c.valorTotal
    acc.liberado += c.valorLiberado
    acc.pago += c.valorPago
    acc.pendente += c.valorPendente
    return acc
  }, { total: 0, liberado: 0, pago: 0, pendente: 0 })

  if (loading) {
    return <div className="text-gray-500 text-center py-20">Carregando...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Contas a Pagar</h1>
        <p className="text-gray-500 text-sm">Pagamentos aos consignantes (libera após comprador quitar)</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {[
          { label: 'Total a Pagar', val: totais.total, color: 'text-gold' },
          { label: 'Liberado', val: totais.liberado, color: 'text-green-400', sub: 'compradores quitaram' },
          { label: 'Pago', val: totais.pago, color: 'text-blue-400' },
          { label: 'Aguardando', val: totais.pendente, color: 'text-yellow-400', sub: 'compradores devem' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 card-hover">
            <div className="text-xs text-gray-500 mb-1">{s.label}</div>
            <div className={`text-xl font-bold stat-value ${s.color}`}>{formatCurrency(s.val)}</div>
            {s.sub && <div className="text-2xs text-gray-600 mt-1">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">🔍</span>
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar consignante..."
            className="bg-card border border-border rounded-xl pl-8 pr-4 py-2 text-sm text-white focus:border-gold/50 transition-colors w-60" />
        </div>
        <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'liberado', label: 'Liberados' },
            { key: 'aguardando', label: 'Aguardando' },
            { key: 'pago', label: 'Pagos' }
          ].map(f => (
            <button key={f.key} onClick={() => setFiltro(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filtro === f.key ? 'bg-gold text-black' : 'text-gray-400 hover:text-white'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de consignantes */}
      <div className="space-y-3">
        {filtered.map(c => {
          const isExpanded = expandedId === c.nome
          const saldoLiberado = c.valorLiberado - c.valorPago

          return (
            <div key={c.nome} className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Header */}
              <div 
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : c.nome)}
              >
                <div className="flex items-center gap-4">
                  <span className="text-gray-600">{isExpanded ? '▼' : '▶'}</span>
                  <div>
                    <div className="text-white font-medium">{c.nome}</div>
                    <div className="text-xs text-gray-500">
                      {c.lotes.length} lotes • 
                      <span className="text-green-400 ml-1">{c.lotesPagos.length} liberados</span>
                      {c.lotesPendentes.length > 0 && (
                        <span className="text-yellow-400 ml-1">• {c.lotesPendentes.length} aguardando</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-right">
                    <div className="text-green-400 font-bold stat-value">{formatCurrency(c.valorLiberado)}</div>
                    <div className="text-xs text-gray-500">liberado</div>
                  </div>
                  <div className="text-right">
                    <div className="text-blue-400 font-medium stat-value">{formatCurrency(c.valorPago)}</div>
                    <div className="text-xs text-gray-500">pago</div>
                  </div>
                  <div className="text-right">
                    <div className="text-yellow-400 font-medium stat-value">{formatCurrency(c.valorPendente)}</div>
                    <div className="text-xs text-gray-500">aguardando</div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    c.status === 'pago' ? 'bg-blue-500/20 text-blue-400' :
                    c.status === 'parcial' ? 'bg-purple-500/20 text-purple-400' :
                    c.status === 'liberado' ? 'bg-green-500/20 text-green-400' :
                    'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {c.status === 'pago' ? '✓ Pago' : 
                     c.status === 'parcial' ? 'Parcial' :
                     c.status === 'liberado' ? 'Liberado' : 
                     'Aguardando'}
                  </span>
                  {saldoLiberado > 0 && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); setModal(c) }}
                      className="bg-gold text-black px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gold-light transition-colors">
                      Pagar
                    </button>
                  )}
                </div>
              </div>

              {/* Lotes expandidos */}
              {isExpanded && (
                <div className="border-t border-border bg-dark/50 px-4 py-3 space-y-4">
                  {/* Histórico de Pagamentos */}
                  {c.valorPago > 0 && (
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                      <h4 className="text-xs font-semibold text-blue-400 mb-2">💳 Histórico de Pagamentos</h4>
                      <div className="text-xs text-gray-400 whitespace-pre-line">
                        {pagamentos.find(p => p.consignante_nome === c.nome)?.notas || `Total pago: ${formatCurrency(c.valorPago)}`}
                      </div>
                      <div className="flex justify-between mt-2 pt-2 border-t border-blue-500/10">
                        <span className="text-xs text-gray-500">Saldo restante:</span>
                        <span className={`text-xs font-mono font-medium ${c.valorLiberado - c.valorPago > 0 ? 'text-gold' : 'text-green-400'}`}>
                          {formatCurrency(Math.max(0, c.valorLiberado - c.valorPago))}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Tabela de Lotes */}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500">
                        <th className="text-left pb-2 font-medium">Lote</th>
                        <th className="text-left pb-2 font-medium">Artista</th>
                        <th className="text-right pb-2 font-medium">Arremate</th>
                        <th className="text-right pb-2 font-medium">Comissão</th>
                        <th className="text-right pb-2 font-medium">A Pagar</th>
                        <th className="text-center pb-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.lotes.map(l => (
                        <tr key={l.lote} className="border-t border-border/30">
                          <td className="py-2 text-gray-400 font-mono">{l.lote}</td>
                          <td className="py-2 text-gray-300 truncate max-w-[150px]">{l.artista}</td>
                          <td className="py-2 text-right text-white font-mono">{formatCurrency(l.arremate)}</td>
                          <td className="py-2 text-right text-red-400 font-mono text-xs">-{formatCurrency(l.comissao)}</td>
                          <td className="py-2 text-right text-gold font-mono font-medium">{formatCurrency(l.valorPagar)}</td>
                          <td className="py-2 text-center">
                            {l.compradorPagou ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">✓ Liberado</span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">⏳ Aguardando</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border">
                        <td colSpan={2} className="py-2 text-gray-500 text-xs">Total</td>
                        <td className="py-2 text-right text-white font-mono font-medium">{formatCurrency(c.arremateTotal)}</td>
                        <td className="py-2 text-right text-red-400 font-mono">-{formatCurrency(c.comissaoTotal)}</td>
                        <td className="py-2 text-right text-gold font-mono font-bold">{formatCurrency(c.valorTotal)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Reembolso Sócios */}
      {reembolsoSocios.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-white mb-3">Reembolso Sócios</h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Sócio</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Valor</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Origem</th>
                </tr>
              </thead>
              <tbody>
                {reembolsoSocios.map(s => (
                  <tr key={s.nome} className="border-b border-border/40">
                    <td className="px-4 py-3 text-white font-medium">{s.nome}</td>
                    <td className="px-4 py-3 text-right text-gold font-mono font-medium">{formatCurrency(s.valor)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">Custos pagos pelo sócio</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-white/[0.02]">
                  <td className="px-4 py-3 text-gray-400 font-medium">Total Reembolso</td>
                  <td className="px-4 py-3 text-right text-gold font-mono font-bold">
                    {formatCurrency(reembolsoSocios.reduce((sum, s) => sum + s.valor, 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-600 text-center">
        {filtered.length} consignante{filtered.length !== 1 ? 's' : ''} • Clique para expandir lotes
      </div>

      {modal && <ModalPagarParcelas consignante={modal} onClose={() => setModal(null)} onSave={load} />}
    </div>
  )
}
