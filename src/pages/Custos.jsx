import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/financeiro'

function ModalCusto({ custo, onClose, onSave }) {
  const [descricao, setDescricao] = useState(custo?.descricao || '')
  const [valor, setValor] = useState(custo?.valor || '')
  const [categoria, setCategoria] = useState(custo?.categoria || 'Outros')
  const [pago, setPago] = useState(custo?.pago || false)
  const [data, setData] = useState(custo?.data || new Date().toISOString().split('T')[0])
  const [notas, setNotas] = useState(custo?.notas || '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    if (custo?.id) {
      await supabase.from('spiti_custos').update({ 
        descricao, valor: parseFloat(valor), categoria, pago, data, notas 
      }).eq('id', custo.id)
    }
    onSave(); onClose()
  }

  async function handleDelete() {
    if (!confirm('Excluir este custo?')) return
    setSaving(true)
    await supabase.from('spiti_custos').delete().eq('id', custo.id)
    onSave(); onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-modal animate-slide-up">
        <h3 className="text-white font-semibold mb-4">Editar Custo</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Descrição</label>
            <input value={descricao} onChange={e => setDescricao(e.target.value)}
              className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Valor (R$)</label>
              <input type="number" value={valor} onChange={e => setValor(e.target.value)}
                className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Categoria</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value)}
                className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50">
                {['Produção', 'Fotografia', 'Marketing', 'Plataforma', 'Outros'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Data</label>
            <input type="date" value={data} onChange={e => setData(e.target.value)}
              className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer bg-white/5 border border-gold/20 rounded-lg p-3 transition-colors hover:bg-white/10">
            <input type="checkbox" checked={pago} onChange={e => setPago(e.target.checked)} className="w-4 h-4 rounded accent-gold" />
            <span className="text-sm text-gray-300">Marcado como pago</span>
          </label>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Notas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)}
              className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50 resize-none h-16"
              placeholder="Quem pagou, comprovante..." />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-gold text-black font-semibold py-2.5 rounded-xl text-sm hover:bg-gold-light transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button onClick={onClose} className="flex-1 border border-border text-gray-300 py-2.5 rounded-xl text-sm hover:bg-white/5 transition-colors">
            Cancelar
          </button>
        </div>
        <button onClick={handleDelete} disabled={saving}
          className="w-full mt-3 text-red-400 hover:text-red-300 text-xs py-2 transition-colors disabled:opacity-50">
          Excluir custo
        </button>
      </div>
    </div>
  )
}

function ModalNovoCusto({ onClose, onSave }) {
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [categoria, setCategoria] = useState('Produção')
  const [pago, setPago] = useState(false)
  const [data, setData] = useState(new Date().toISOString().split('T')[0])
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!descricao || !valor) return
    setSaving(true)
    await supabase.from('spiti_custos').insert({
      leilao_id: 'spiti9', descricao, valor: parseFloat(valor), categoria, pago, data, notas
    })
    onSave(); onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-modal animate-slide-up">
        <h3 className="text-white font-semibold mb-4">Novo Custo</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Descrição</label>
            <input value={descricao} onChange={e => setDescricao(e.target.value)} autoFocus
              className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50"
              placeholder="Ex: Aluguel, Fotografia..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Valor (R$)</label>
              <input type="number" value={valor} onChange={e => setValor(e.target.value)}
                className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Categoria</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value)}
                className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50">
                {['Produção', 'Fotografia', 'Marketing', 'Plataforma', 'Outros'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Data</label>
            <input type="date" value={data} onChange={e => setData(e.target.value)}
              className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer bg-white/5 border border-gold/20 rounded-lg p-3 transition-colors hover:bg-white/10">
            <input type="checkbox" checked={pago} onChange={e => setPago(e.target.checked)} className="w-4 h-4 rounded accent-gold" />
            <span className="text-sm text-gray-300">Já foi pago</span>
          </label>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Notas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)}
              className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50 resize-none h-16"
              placeholder="Quem pagou, comprovante..." />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-gold text-black font-semibold py-2.5 rounded-xl text-sm hover:bg-gold-light transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : 'Criar'}
          </button>
          <button onClick={onClose} className="flex-1 border border-border text-gray-300 py-2.5 rounded-xl text-sm hover:bg-white/5 transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

const SORT_OPTIONS = [
  { value: 'data', label: 'Data' },
  { value: 'categoria', label: 'Categoria' },
  { value: 'valor', label: 'Valor' },
  { value: 'descricao', label: 'Descrição' },
]

export default function Custos() {
  const [custos, setCustos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroCategoria, setFiltroCategoria] = useState('todos')
  const [filtroPago, setFiltroPago] = useState('todos')
  const [busca, setBusca] = useState('')
  const [sortBy, setSortBy] = useState('data')
  const [sortDir, setSortDir] = useState('desc')
  const [modal, setModal] = useState(null)
  const [modalNovo, setModalNovo] = useState(false)
  const [categorias, setCategorias] = useState([])

  async function load() {
    const { data } = await supabase.from('spiti_custos').select('*').eq('leilao_id', 'spiti9').order('data', { ascending: false })
    setCustos(data || [])
    
    const cats = [...new Set(data?.map(c => c.categoria) || [])]
    setCategorias(cats.sort())
    
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir(col === 'valor' ? 'desc' : 'asc') }
  }

  const filtered = custos
    .filter(c => {
      if (filtroCategoria !== 'todos' && c.categoria !== filtroCategoria) return false
      if (filtroPago !== 'todos') {
        if (filtroPago === 'pago' && !c.pago) return false
        if (filtroPago === 'pendente' && c.pago) return false
      }
      if (busca && !c.descricao.toLowerCase().includes(busca.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      let va, vb
      if (sortBy === 'data') { va = a.data || ''; vb = b.data || '' }
      else if (sortBy === 'categoria') { va = a.categoria; vb = b.categoria }
      else if (sortBy === 'valor') { va = a.valor; vb = b.valor }
      else if (sortBy === 'descricao') { va = a.descricao; vb = b.descricao }
      
      if (sortDir === 'asc') return va > vb ? 1 : -1
      return va < vb ? 1 : -1
    })

  const totais = custos.reduce((acc, c) => {
    acc.total += c.valor
    if (c.pago) acc.pago += c.valor
    else acc.pendente += c.valor
    return acc
  }, { total: 0, pago: 0, pendente: 0 })

  function SortIcon({ col }) {
    if (sortBy !== col) return <span className="text-gray-700 ml-1">↕</span>
    return <span className="text-gold ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Custos</h1>
          <p className="text-gray-500 text-sm">Despesas do leilão</p>
        </div>
        <button onClick={() => setModalNovo(true)}
          className="bg-gold text-black font-semibold px-4 py-2 rounded-xl text-sm hover:bg-gold-light transition-colors">
          + Novo Custo
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total de Custos', val: totais.total, color: 'text-red-400' },
          { label: 'Pago', val: totais.pago, color: 'text-green-400' },
          { label: 'Pendente', val: totais.pendente, color: 'text-yellow-400' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 card-hover">
            <div className="text-xs text-gray-500 mb-1">{s.label}</div>
            <div className={`text-xl font-bold stat-value ${s.color}`}>{formatCurrency(s.val)}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">🔍</span>
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar custo..."
              className="bg-card border border-border rounded-xl pl-8 pr-4 py-2 text-sm text-white focus:border-gold/50 transition-colors w-60" />
          </div>
          <div className="flex items-center gap-2 ml-auto text-xs text-gray-500">
            Ordenar:
            {SORT_OPTIONS.map(o => (
              <button key={o.value} onClick={() => toggleSort(o.value)}
                className={`px-2 py-1 rounded transition-colors ${sortBy === o.value ? 'text-gold' : 'hover:text-white'}`}>
                {o.label}<SortIcon col={o.value} />
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
            <button onClick={() => setFiltroPago('todos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filtroPago === 'todos' ? 'bg-gold text-black' : 'text-gray-400 hover:text-white'
              }`}>
              Todos
            </button>
            {['pago', 'pendente'].map(f => (
              <button key={f} onClick={() => setFiltroPago(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filtroPago === f ? 'bg-gold text-black' : 'text-gray-400 hover:text-white'
                }`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
            <button onClick={() => setFiltroCategoria('todos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filtroCategoria === 'todos' ? 'bg-gold text-black' : 'text-gray-400 hover:text-white'
              }`}>
              Todas
            </button>
            {categorias.map(cat => (
              <button key={cat} onClick={() => setFiltroCategoria(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filtroCategoria === cat ? 'bg-gold text-black' : 'text-gray-400 hover:text-white'
                }`}>
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {[
                { label: 'Data', col: 'data' }, { label: 'Descrição', col: 'descricao' },
                { label: 'Categoria', col: 'categoria' }, { label: 'Valor', col: 'valor' },
                { label: 'Status', col: null }
              ].map(h => (
                <th key={h.label}
                  onClick={h.col ? () => toggleSort(h.col) : undefined}
                  className={`text-left px-4 py-3 text-xs text-gray-500 font-medium ${h.col ? 'cursor-pointer hover:text-gray-300' : ''}`}>
                  {h.label}{h.col && <span className={`ml-1 ${sortBy === h.col ? 'text-gold' : 'text-gray-700'}`}>{sortBy === h.col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-10 text-gray-600">Carregando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-gray-600">Nenhum resultado</td></tr>
            ) : (
              filtered.map((c, i) => (
                <tr key={c.id} 
                  onClick={() => setModal(c)}
                  className={`border-b border-border/40 transition-colors cursor-pointer hover:bg-white/[0.03] ${i % 2 !== 0 ? 'bg-white/[0.015]' : ''}`}>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono">{c.data || '—'}</td>
                  <td className="px-4 py-3 text-white font-medium max-w-[200px] truncate">{c.descricao}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{c.categoria}</td>
                  <td className="px-4 py-3 text-red-400 stat-value font-medium">{formatCurrency(c.valor)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      c.pago ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {c.pago ? '✓ Pago' : '⊙ Pendente'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="px-4 py-2 border-t border-border text-xs text-gray-600">
          {filtered.length} custo{filtered.length !== 1 ? 's' : ''} • Clique na linha para editar
        </div>
      </div>

      {modal && <ModalCusto custo={modal} onClose={() => setModal(null)} onSave={load} />}
      {modalNovo && <ModalNovoCusto onClose={() => setModalNovo(false)} onSave={load} />}
    </div>
  )
}
