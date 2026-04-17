import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency, calcularComissaoComprador } from '../lib/financeiro'

const LEILAO_ID = 'spiti9'

function ModalCliente({ cliente, onClose, onSave }) {
  const isEdit = Boolean(cliente?.id)
  const [form, setForm] = useState(() => ({
    nome: cliente?.nome || '',
    cpf: cliente?.cpf || '',
    endereco: cliente?.endereco || '',
    email: cliente?.email || '',
    telefone: cliente?.telefone || '',
    cartela: cliente?.cartela || '',
    notas: cliente?.notas || ''
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    if (!form.nome.trim()) return
    setSaving(true)
    setError(null)

    const payload = {
      leilao_id: LEILAO_ID,
      nome: form.nome.trim(),
      cpf: form.cpf.trim() || null,
      endereco: form.endereco.trim() || null,
      email: form.email.trim() || null,
      telefone: form.telefone.trim() || null,
      cartela: form.cartela.trim() || null,
      notas: form.notas.trim() || null
    }

    const { error: err } = isEdit
      ? await supabase.from('spiti_clientes').update(payload).eq('id', cliente.id)
      : await supabase.from('spiti_clientes').insert(payload)

    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }
    onSave()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-modal animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-semibold">{isEdit ? 'Editar Cliente' : '+ Novo Cliente'}</h3>
            <p className="text-gray-500 text-xs">{isEdit ? 'Atualizar dados cadastrais' : 'Cadastro completo do cliente'}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Nome completo *</label>
            <input value={form.nome} onChange={e => update('nome', e.target.value)}
              className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50"
              placeholder="Nome completo" autoFocus />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">CPF</label>
            <input value={form.cpf} onChange={e => update('cpf', e.target.value)}
              className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50"
              placeholder="000.000.000-00" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Endereço</label>
            <input value={form.endereco} onChange={e => update('endereco', e.target.value)}
              className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50"
              placeholder="Rua, número, bairro, cidade" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={e => update('email', e.target.value)}
                className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50"
                placeholder="email@exemplo.com" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Telefone</label>
              <input value={form.telefone} onChange={e => update('telefone', e.target.value)}
                className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50"
                placeholder="(00) 00000-0000" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Cartela</label>
            <input value={form.cartela} onChange={e => update('cartela', e.target.value)}
              className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50"
              placeholder="Número da cartela" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Notas</label>
            <textarea value={form.notas} onChange={e => update('notas', e.target.value)} rows={3}
              className="w-full bg-dark border border-border rounded-xl px-3 py-2 text-sm text-white focus:border-gold/50 resize-none"
              placeholder="Observações..." />
          </div>
        </div>

        {error && (
          <div className="mt-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={handleSave} disabled={saving || !form.nome.trim()}
            className="flex-1 bg-gold text-black font-semibold py-2.5 rounded-xl text-sm hover:bg-gold-light transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar cliente'}
          </button>
          <button onClick={onClose} className="flex-1 border border-border text-gray-300 py-2.5 rounded-xl text-sm hover:bg-white/5">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalConfirmarExclusao({ cliente, vendasCount, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false)
  const blocked = vendasCount > 0

  async function handleDelete() {
    setDeleting(true)
    await onConfirm()
    setDeleting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] p-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-modal animate-slide-up">
        <h3 className="text-white font-semibold mb-1">Excluir cliente</h3>
        <p className="text-gray-400 text-sm mb-4">
          {blocked ? (
            <>
              Este cliente tem <span className="text-red-400 font-semibold">{vendasCount} {vendasCount === 1 ? 'lote vinculado' : 'lotes vinculados'}</span> em Vendas. Transfira ou remova esses lotes antes de excluir.
            </>
          ) : (
            <>
              Tem certeza que deseja excluir <span className="text-white font-semibold">{cliente.nome}</span>? Esta ação não pode ser desfeita.
            </>
          )}
        </p>

        <div className="flex gap-3">
          {!blocked && (
            <button onClick={handleDelete} disabled={deleting}
              className="flex-1 bg-red-500/90 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-red-500 transition-colors disabled:opacity-50">
              {deleting ? 'Excluindo...' : 'Excluir'}
            </button>
          )}
          <button onClick={onClose} className="flex-1 border border-border text-gray-300 py-2.5 rounded-xl text-sm hover:bg-white/5">
            {blocked ? 'Entendi' : 'Cancelar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DrawerCliente({ cliente, vendas, lotes, cobrancas, onClose, onEdit, onDelete }) {
  const vendasCliente = vendas.filter(v =>
    v.comprador_id === cliente.id ||
    (!v.comprador_id && v.comprador_nome && cliente.nome && v.comprador_nome.toLowerCase().trim() === cliente.nome.toLowerCase().trim())
  )

  const lotesMap = useMemo(() => {
    const m = new Map()
    lotes.forEach(l => m.set(l.lote, l))
    return m
  }, [lotes])

  const cobrancaPorLote = useMemo(() => {
    const m = new Map()
    cobrancas.forEach(c => {
      (c.lotes || []).forEach(lote => m.set(lote, c))
    })
    return m
  }, [cobrancas])

  const totais = vendasCliente.reduce((acc, v) => {
    const valor = v.valor_arremate || 0
    const comissao = calcularComissaoComprador(valor)
    acc.arremate += valor
    acc.comissao += comissao
    acc.total += valor + comissao
    return acc
  }, { arremate: 0, comissao: 0, total: 0 })

  function statusLabel(lote) {
    const cob = cobrancaPorLote.get(lote)
    if (cob?.status === 'pago') return { label: '✓ Pago', cls: 'text-green-400' }
    if (cob?.status === 'parcial') return { label: 'Parcial', cls: 'text-blue-400' }
    if (cob?.lancado) return { label: 'Cobrando', cls: 'text-yellow-400' }
    return { label: 'Vendido', cls: 'text-orange-400' }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[60]" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="absolute top-0 right-0 h-full w-full max-w-2xl bg-card border-l border-border shadow-2xl overflow-y-auto animate-slide-up">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">{cliente.nome}</h2>
              <p className="text-gray-500 text-xs mt-1">
                {cliente.cartela ? `Cartela ${cliente.cartela}` : 'Sem cartela'}
                {cliente.cpf ? ` • ${cliente.cpf}` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={onEdit}
                className="px-3 py-1.5 bg-gold/10 text-gold border border-gold/30 rounded-lg text-xs font-medium hover:bg-gold/20 transition-colors">
                Editar
              </button>
              <button onClick={onDelete}
                className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-colors">
                Excluir
              </button>
              <button onClick={onClose} className="text-gray-500 hover:text-white ml-2">✕</button>
            </div>
          </div>

          {/* Contato */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-500 mb-1">Email</div>
              <div className="text-sm text-white truncate">{cliente.email || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Telefone</div>
              <div className="text-sm text-white">{cliente.telefone || '—'}</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-gray-500 mb-1">Endereço</div>
              <div className="text-sm text-white">{cliente.endereco || '—'}</div>
            </div>
            {cliente.notas && (
              <div className="col-span-2">
                <div className="text-xs text-gray-500 mb-1">Notas</div>
                <div className="text-sm text-gray-300 whitespace-pre-wrap">{cliente.notas}</div>
              </div>
            )}
          </div>

          {/* Totais */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-dark border border-border rounded-xl p-3">
              <div className="text-2xs text-gray-500 mb-1">Lotes arrematados</div>
              <div className="text-lg font-bold text-white">{vendasCliente.length}</div>
            </div>
            <div className="bg-dark border border-border rounded-xl p-3">
              <div className="text-2xs text-gray-500 mb-1">Arremate</div>
              <div className="text-lg font-bold text-gold stat-value">{formatCurrency(totais.arremate)}</div>
            </div>
            <div className="bg-dark border border-border rounded-xl p-3">
              <div className="text-2xs text-gray-500 mb-1">Total c/ comissão</div>
              <div className="text-lg font-bold text-yellow-400 stat-value">{formatCurrency(totais.total)}</div>
            </div>
          </div>

          {/* Histórico de lotes */}
          <div>
            <h3 className="text-white font-semibold text-sm mb-3">Histórico de compras</h3>
            {vendasCliente.length === 0 ? (
              <div className="bg-dark border border-border rounded-xl p-6 text-center text-gray-600 text-sm">
                Nenhuma compra registrada
              </div>
            ) : (
              <div className="bg-dark border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Lote</th>
                      <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Artista</th>
                      <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Arremate</th>
                      <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Comissão</th>
                      <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendasCliente.map(v => {
                      const lote = lotesMap.get(v.lote)
                      const comissao = calcularComissaoComprador(v.valor_arremate || 0)
                      const st = statusLabel(v.lote)
                      return (
                        <tr key={v.id} className="border-b border-border/40">
                          <td className="px-4 py-2 font-mono text-gold">{v.lote}</td>
                          <td className="px-4 py-2 text-white truncate max-w-[180px]">{lote?.artista || '—'}</td>
                          <td className="px-4 py-2 text-right text-white stat-value">{formatCurrency(v.valor_arremate || 0)}</td>
                          <td className="px-4 py-2 text-right text-yellow-400 stat-value">{formatCurrency(comissao)}</td>
                          <td className={`px-4 py-2 text-xs font-medium ${st.cls}`}>{st.label}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [vendas, setVendas] = useState([])
  const [lotes, setLotes] = useState([])
  const [cobrancas, setCobrancas] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroCompras, setFiltroCompras] = useState('todos')
  const [sortBy, setSortBy] = useState('nome')
  const [sortDir, setSortDir] = useState('asc')
  const [modalNovo, setModalNovo] = useState(false)
  const [editando, setEditando] = useState(null)
  const [selecionado, setSelecionado] = useState(null)
  const [excluindo, setExcluindo] = useState(null)

  async function load() {
    const [
      { data: clientesData },
      { data: vendasData },
      { data: lotesData },
      { data: cobrancasData }
    ] = await Promise.all([
      supabase.from('spiti_clientes').select('*').eq('leilao_id', LEILAO_ID).order('nome'),
      supabase.from('spiti_vendas').select('*').eq('leilao_id', LEILAO_ID),
      supabase.from('spiti_lotes_financeiro').select('lote,artista').eq('leilao_id', LEILAO_ID),
      supabase.from('spiti_cobrancas').select('*').eq('leilao_id', LEILAO_ID)
    ])
    setClientes(clientesData || [])
    setVendas(vendasData || [])
    setLotes(lotesData || [])
    setCobrancas(cobrancasData || [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [])

  // Enrichment: conta lotes e arremate por cliente (via id OU nome)
  const clientesEnriquecidos = useMemo(() => {
    return clientes.map(c => {
      const vendasCliente = vendas.filter(v =>
        v.comprador_id === c.id ||
        (!v.comprador_id && v.comprador_nome && c.nome && v.comprador_nome.toLowerCase().trim() === c.nome.toLowerCase().trim())
      )
      const arremate = vendasCliente.reduce((s, v) => s + (v.valor_arremate || 0), 0)
      const comissao = vendasCliente.reduce((s, v) => s + calcularComissaoComprador(v.valor_arremate || 0), 0)
      return {
        ...c,
        nLotes: vendasCliente.length,
        arremate,
        comissao,
        total: arremate + comissao
      }
    })
  }, [clientes, vendas])

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir(col === 'nome' ? 'asc' : 'desc') }
  }

  const filtered = clientesEnriquecidos
    .filter(c => {
      if (filtroCompras === 'com' && c.nLotes === 0) return false
      if (filtroCompras === 'sem' && c.nLotes > 0) return false
      if (busca) {
        const q = busca.toLowerCase()
        const match = c.nome?.toLowerCase().includes(q) ||
          c.cpf?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.telefone?.toLowerCase().includes(q) ||
          c.cartela?.toLowerCase().includes(q)
        if (!match) return false
      }
      return true
    })
    .sort((a, b) => {
      let va, vb
      if (sortBy === 'nome') { va = a.nome || ''; vb = b.nome || '' }
      else if (sortBy === 'lotes') { va = a.nLotes; vb = b.nLotes }
      else if (sortBy === 'arremate') { va = a.arremate; vb = b.arremate }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      return sortDir === 'asc' ? va - vb : vb - va
    })

  const totais = useMemo(() => {
    const comCompras = clientesEnriquecidos.filter(c => c.nLotes > 0)
    return {
      total: clientesEnriquecidos.length,
      comCompras: comCompras.length,
      semCompras: clientesEnriquecidos.length - comCompras.length,
      arremate: comCompras.reduce((s, c) => s + c.arremate, 0),
      comissao: comCompras.reduce((s, c) => s + c.comissao, 0)
    }
  }, [clientesEnriquecidos])

  async function handleDelete(cliente) {
    const { error } = await supabase.from('spiti_clientes').delete().eq('id', cliente.id)
    if (error) {
      alert('Erro ao excluir: ' + error.message)
      return
    }
    setExcluindo(null)
    setSelecionado(null)
    load()
  }

  function SortIcon({ col }) {
    if (sortBy !== col) return <span className="text-gray-700 ml-1">↕</span>
    return <span className="text-gold ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  if (loading) {
    return <div className="text-gray-500 text-center py-20">Carregando...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Clientes</h1>
          <p className="text-gray-500 text-sm">Compradores cadastrados e histórico de arremates</p>
        </div>
        <button onClick={() => setModalNovo(true)}
          className="bg-gold text-black font-semibold px-4 py-2 rounded-xl text-sm hover:bg-gold-light transition-colors">
          + Novo cliente
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 card-hover">
          <div className="text-xs text-gray-500 mb-1">Total clientes</div>
          <div className="text-xl font-bold text-white">{totais.total}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 card-hover">
          <div className="text-xs text-gray-500 mb-1">Compradores ativos</div>
          <div className="text-xl font-bold text-green-400">{totais.comCompras}</div>
          <div className="text-2xs text-gray-600">{totais.semCompras} sem compras</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 card-hover">
          <div className="text-xs text-gray-500 mb-1">Arremate total</div>
          <div className="text-xl font-bold text-gold stat-value">{formatCurrency(totais.arremate)}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 card-hover">
          <div className="text-xs text-gray-500 mb-1">Comissão compradores</div>
          <div className="text-xl font-bold text-yellow-400 stat-value">{formatCurrency(totais.comissao)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">🔍</span>
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar nome, CPF, email, cartela..."
            className="bg-card border border-border rounded-xl pl-8 pr-4 py-2 text-sm text-white focus:border-gold/50 transition-colors w-72" />
        </div>
        <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'com', label: 'Com compras' },
            { key: 'sem', label: 'Sem compras' }
          ].map(f => (
            <button key={f.key} onClick={() => setFiltroCompras(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filtroCompras === f.key ? 'bg-gold text-black' : 'text-gray-400 hover:text-white'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {[
                  { label: 'Nome', col: 'nome', w: '' },
                  { label: 'Contato', col: null, w: '' },
                  { label: 'CPF', col: null, w: 'w-36' },
                  { label: 'Cartela', col: null, w: 'w-20' },
                  { label: 'Lotes', col: 'lotes', w: 'w-20' },
                  { label: 'Arremate', col: 'arremate', w: '' },
                  { label: 'Comissão', col: null, w: '' }
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
                <tr><td colSpan={7} className="text-center py-10 text-gray-600">
                  {clientes.length === 0 ? 'Nenhum cliente cadastrado ainda' : 'Nenhum resultado'}
                </td></tr>
              ) : (
                filtered.map((c, i) => (
                  <tr key={c.id}
                    onClick={() => setSelecionado(c)}
                    className={`border-b border-border/40 transition-colors cursor-pointer hover:bg-white/[0.03] ${i % 2 !== 0 ? 'bg-white/[0.015]' : ''}`}>
                    <td className="px-4 py-2 text-white font-medium truncate max-w-[200px]">{c.nome}</td>
                    <td className="px-4 py-2 text-gray-400 text-xs">
                      <div className="truncate max-w-[180px]">{c.email || '—'}</div>
                      <div className="text-gray-600">{c.telefone || '—'}</div>
                    </td>
                    <td className="px-4 py-2 text-gray-400 font-mono text-xs">{c.cpf || '—'}</td>
                    <td className="px-4 py-2 text-gray-400 text-xs">{c.cartela || '—'}</td>
                    <td className="px-4 py-2 text-white font-medium">
                      {c.nLotes > 0 ? (
                        <span className="bg-gold/10 text-gold px-2 py-0.5 rounded-full text-xs">{c.nLotes}</span>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-white stat-value">{c.arremate ? formatCurrency(c.arremate) : '—'}</td>
                    <td className="px-4 py-2 text-yellow-400 stat-value">{c.comissao ? formatCurrency(c.comissao) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-border text-xs text-gray-600">
          {filtered.length} {filtered.length === 1 ? 'cliente' : 'clientes'} • Clique para ver detalhes
        </div>
      </div>

      {modalNovo && (
        <ModalCliente onClose={() => setModalNovo(false)} onSave={load} />
      )}
      {editando && (
        <ModalCliente cliente={editando}
          onClose={() => setEditando(null)}
          onSave={() => { load(); setSelecionado(s => s ? { ...s, ...editando } : s) }} />
      )}
      {selecionado && !editando && !excluindo && (
        <DrawerCliente
          cliente={selecionado}
          vendas={vendas}
          lotes={lotes}
          cobrancas={cobrancas}
          onClose={() => setSelecionado(null)}
          onEdit={() => setEditando(selecionado)}
          onDelete={() => setExcluindo(selecionado)} />
      )}
      {excluindo && (
        <ModalConfirmarExclusao
          cliente={excluindo}
          vendasCount={clientesEnriquecidos.find(c => c.id === excluindo.id)?.nLotes || 0}
          onClose={() => setExcluindo(null)}
          onConfirm={() => handleDelete(excluindo)} />
      )}
    </div>
  )
}
