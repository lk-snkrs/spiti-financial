import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/financeiro'

function ModalLote({ lote, onClose, onSave }) {
  const [artista, setArtista] = useState(lote?.artista || '')
  const [consignante, setConsignante] = useState(lote?.consignante || '')
  const [valorBase, setValorBase] = useState(lote?.valor_base || '')
  const [comissao, setComissao] = useState(lote?.comissao_consignante_pct || 10)
  const [captacao, setCaptacao] = useState(lote?.captacao || '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await supabase.from('spiti_lotes_financeiro').update({
      artista,
      consignante,
      valor_base: parseFloat(valorBase) || 0,
      comissao_consignante_pct: parseInt(comissao) || 10,
      captacao
    }).eq('id', lote.id)
    onSave(); onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-modal animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-semibold">Lote {lote.lote}</h3>
            <p className="text-gray-500 text-xs">{lote.artista}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Artista</label>
            <input value={artista} onChange={e => setArtista(e.target.value)}
              className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Consignante</label>
            <input value={consignante} onChange={e => setConsignante(e.target.value)}
              className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Valor Base (R$)</label>
              <input type="number" value={valorBase} onChange={e => setValorBase(e.target.value)}
                className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Comissão Consig. (%)</label>
              <input type="number" value={comissao} onChange={e => setComissao(e.target.value)}
                className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Captação</label>
            <input value={captacao} onChange={e => setCaptacao(e.target.value)}
              className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50" />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-gold text-black font-semibold py-2.5 rounded-xl text-sm hover:bg-gold-light transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button onClick={onClose} className="flex-1 border border-border text-gray-300 py-2.5 rounded-xl text-sm hover:bg-white/5">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

const SORT_OPTIONS = [
  { value: 'lote', label: 'Lote' },
  { value: 'artista', label: 'Artista' },
  { value: 'consignante', label: 'Consignante' },
  { value: 'valor_base', label: 'Valor' },
]

export default function Lotes() {
  const [lotes, setLotes] = useState([])
  const [vendas, setVendas] = useState([])
  const [cobrancas, setCobrancas] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroConsignante, setFiltroConsignante] = useState('')
  const [sortBy, setSortBy] = useState('lote')
  const [sortDir, setSortDir] = useState('asc')
  const [modal, setModal] = useState(null)

  async function load() {
    const [{ data: lotesData }, { data: vendasData }, { data: cobrancasData }] = await Promise.all([
      supabase.from('spiti_lotes_financeiro').select('*').eq('leilao_id', 'spiti9').order('lote'),
      supabase.from('spiti_vendas').select('*').eq('leilao_id', 'spiti9'),
      supabase.from('spiti_cobrancas').select('*').eq('leilao_id', 'spiti9')
    ])
    setLotes(lotesData || [])
    setVendas(vendasData || [])
    setCobrancas(cobrancasData || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Enriquecer lotes com info de venda e status de pagamento
  const lotesEnriquecidos = useMemo(() => {
    return lotes.map(lote => {
      const venda = vendas.find(v => v.lote === lote.lote)
      const cobranca = cobrancas.find(c => c.lotes?.includes(lote.lote))
      
      let statusPagamento = 'nao_vendido'
      if (venda) {
        if (cobranca?.status === 'pago') statusPagamento = 'pago'
        else if (cobranca?.status === 'parcial') statusPagamento = 'parcial'
        else if (cobranca?.lancado) statusPagamento = 'cobrando'
        else statusPagamento = 'vendido'
      }

      return {
        ...lote,
        venda,
        cobranca,
        statusPagamento,
        comprador: venda?.comprador_nome,
        valorArremate: venda?.valor_arremate || 0,
        comissaoValor: (venda?.valor_arremate || 0) * (lote.comissao_consignante_pct / 100),
        valorConsignante: (venda?.valor_arremate || 0) * (1 - lote.comissao_consignante_pct / 100)
      }
    })
  }, [lotes, vendas, cobrancas])

  // Consignantes únicos para filtro
  const consignantes = useMemo(() => {
    const set = new Set(lotes.map(l => l.consignante).filter(Boolean))
    return Array.from(set).sort()
  }, [lotes])

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir(col === 'lote' ? 'asc' : 'desc') }
  }

  const filtered = lotesEnriquecidos
    .filter(l => {
      if (filtroStatus === 'vendido' && l.statusPagamento === 'nao_vendido') return false
      if (filtroStatus === 'nao_vendido' && l.statusPagamento !== 'nao_vendido') return false
      if (filtroStatus === 'pago' && l.statusPagamento !== 'pago') return false
      if (filtroStatus === 'pendente' && !['vendido', 'cobrando', 'parcial'].includes(l.statusPagamento)) return false
      if (filtroConsignante && l.consignante !== filtroConsignante) return false
      if (busca) {
        const q = busca.toLowerCase()
        const match = String(l.lote).includes(q) ||
          l.artista?.toLowerCase().includes(q) ||
          l.consignante?.toLowerCase().includes(q) ||
          l.comprador?.toLowerCase().includes(q)
        if (!match) return false
      }
      return true
    })
    .sort((a, b) => {
      let va, vb
      if (sortBy === 'lote') { va = a.lote; vb = b.lote }
      else if (sortBy === 'artista') { va = a.artista || ''; vb = b.artista || '' }
      else if (sortBy === 'consignante') { va = a.consignante || ''; vb = b.consignante || '' }
      else if (sortBy === 'valor_base') { va = a.valor_base || 0; vb = b.valor_base || 0 }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      return sortDir === 'asc' ? va - vb : vb - va
    })

  const totais = useMemo(() => {
    const vendidos = lotesEnriquecidos.filter(l => l.statusPagamento !== 'nao_vendido')
    return {
      total: lotesEnriquecidos.length,
      vendidos: vendidos.length,
      naoVendidos: lotesEnriquecidos.length - vendidos.length,
      arremateTotal: vendidos.reduce((sum, l) => sum + l.valorArremate, 0),
      comissaoTotal: vendidos.reduce((sum, l) => sum + l.comissaoValor, 0),
      consignanteTotal: vendidos.reduce((sum, l) => sum + l.valorConsignante, 0),
      pagos: vendidos.filter(l => l.statusPagamento === 'pago').length
    }
  }, [lotesEnriquecidos])

  function SortIcon({ col }) {
    if (sortBy !== col) return <span className="text-gray-700 ml-1">↕</span>
    return <span className="text-gold ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  function StatusBadge({ status }) {
    const styles = {
      'pago': 'bg-green-500/20 text-green-400',
      'parcial': 'bg-blue-500/20 text-blue-400',
      'cobrando': 'bg-yellow-500/20 text-yellow-400',
      'vendido': 'bg-orange-500/20 text-orange-400',
      'nao_vendido': 'bg-gray-500/20 text-gray-500'
    }
    const labels = {
      'pago': '✓ Pago',
      'parcial': 'Parcial',
      'cobrando': 'Cobrando',
      'vendido': 'Vendido',
      'nao_vendido': 'Não vendido'
    }
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    )
  }

  if (loading) {
    return <div className="text-gray-500 text-center py-20">Carregando...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Lotes</h1>
          <p className="text-gray-500 text-sm">Catálogo completo do leilão</p>
        </div>
        <div className="text-right text-xs text-gray-500">
          {totais.vendidos}/{totais.total} vendidos ({((totais.vendidos/totais.total)*100).toFixed(0)}%)
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-4">
        <div className="bg-card border border-border rounded-xl p-4 card-hover">
          <div className="text-xs text-gray-500 mb-1">Total Lotes</div>
          <div className="text-xl font-bold text-white">{totais.total}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 card-hover">
          <div className="text-xs text-gray-500 mb-1">Vendidos</div>
          <div className="text-xl font-bold text-green-400">{totais.vendidos}</div>
          <div className="text-2xs text-gray-600">{totais.pagos} pagos</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 card-hover">
          <div className="text-xs text-gray-500 mb-1">Arremate Total</div>
          <div className="text-xl font-bold text-gold stat-value">{formatCurrency(totais.arremateTotal)}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 card-hover">
          <div className="text-xs text-gray-500 mb-1">Comissão SPITI</div>
          <div className="text-xl font-bold text-blue-400 stat-value">{formatCurrency(totais.comissaoTotal)}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 card-hover">
          <div className="text-xs text-gray-500 mb-1">A Pagar Consig.</div>
          <div className="text-xl font-bold text-red-400 stat-value">{formatCurrency(totais.consignanteTotal)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">🔍</span>
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar lote, artista, consignante..."
            className="bg-card border border-border rounded-xl pl-8 pr-4 py-2 text-sm text-white focus:border-gold/50 transition-colors w-72" />
        </div>
        <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'vendido', label: 'Vendidos' },
            { key: 'nao_vendido', label: 'Não vendidos' },
            { key: 'pago', label: 'Pagos' },
            { key: 'pendente', label: 'Pendentes' }
          ].map(f => (
            <button key={f.key} onClick={() => setFiltroStatus(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filtroStatus === f.key ? 'bg-gold text-black' : 'text-gray-400 hover:text-white'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <select value={filtroConsignante} onChange={e => setFiltroConsignante(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50">
          <option value="">Todos consignantes</option>
          {consignantes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {[
                  { label: 'Lote', col: 'lote', w: 'w-16' },
                  { label: 'Artista', col: 'artista', w: '' },
                  { label: 'Consignante', col: 'consignante', w: '' },
                  { label: 'Comissão', col: null, w: 'w-20' },
                  { label: 'Valor Base', col: 'valor_base', w: '' },
                  { label: 'Arremate', col: null, w: '' },
                  { label: 'Comprador', col: null, w: '' },
                  { label: 'Status', col: null, w: 'w-24' }
                ].map(h => (
                  <th key={h.label}
                    onClick={h.col ? () => toggleSort(h.col) : undefined}
                    className={`text-left px-4 py-3 text-xs text-gray-500 font-medium ${h.w} ${h.col ? 'cursor-pointer hover:text-gray-300' : ''}`}>
                    {h.label}{h.col && <SortIcon col={h.col} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-gray-600">Nenhum resultado</td></tr>
              ) : (
                filtered.map((l, i) => (
                  <tr key={l.id}
                    onClick={() => setModal(l)}
                    className={`border-b border-border/40 transition-colors cursor-pointer hover:bg-white/[0.03] ${i % 2 !== 0 ? 'bg-white/[0.015]' : ''}`}>
                    <td className="px-4 py-2 font-mono text-gold font-medium">{l.lote}</td>
                    <td className="px-4 py-2 text-white truncate max-w-[180px]">{l.artista || '—'}</td>
                    <td className="px-4 py-2 text-gray-400 truncate max-w-[150px]">{l.consignante || '—'}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{l.comissao_consignante_pct}%</td>
                    <td className="px-4 py-2 text-gray-400 stat-value">{l.valor_base ? formatCurrency(l.valor_base) : '—'}</td>
                    <td className="px-4 py-2 text-white stat-value font-medium">
                      {l.valorArremate ? formatCurrency(l.valorArremate) : '—'}
                    </td>
                    <td className="px-4 py-2 text-gray-400 truncate max-w-[150px]">{l.comprador || '—'}</td>
                    <td className="px-4 py-2"><StatusBadge status={l.statusPagamento} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-border text-xs text-gray-600">
          {filtered.length} lote{filtered.length !== 1 ? 's' : ''} • Clique para editar
        </div>
      </div>

      {modal && <ModalLote lote={modal} onClose={() => setModal(null)} onSave={load} />}
    </div>
  )
}
