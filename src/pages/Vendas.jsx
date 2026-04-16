import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency, calcularComissaoComprador, calcularTotalComprador } from '../lib/financeiro'

const DARK = '#0A0A0A'
const CARD = '#1A1A1A'
const BORDER = '#2A2A2A'
const GOLD = '#C9A84C'

// Modal de Transferência de Lote
function ModalTransferir({ lote, compradores, currentComprador, onClose, onSave }) {
  const [destino, setDestino] = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [saving, setSaving] = useState(false)

  const outrosCompradores = compradores.filter(c => c.nome !== currentComprador)

  async function handleTransferir() {
    setSaving(true)
    const novoComprador = destino === 'novo' ? novoNome : destino
    if (!novoComprador) return

    await supabase.from('spiti_vendas')
      .update({ comprador_nome: novoComprador, comprador_id: null, lancado: false })
      .eq('lote', lote.lote)
      .eq('leilao_id', 'spiti9')

    onSave(); onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
      <div style={{ background: CARD, border: `1px solid ${BORDER}` }} className="rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-white font-semibold mb-1">Transferir Lote</h3>
        <p className="text-gray-500 text-xs mb-4">
          Lote {lote.lote} — {lote.artista} — {formatCurrency(lote.valor)}
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Transferir para</label>
            <select value={destino} onChange={e => setDestino(e.target.value)}
              style={{ background: DARK, border: `1px solid ${BORDER}` }}
              className="w-full rounded-xl px-3 py-2 text-sm text-white">
              <option value="">Selecione...</option>
              {outrosCompradores.map(c => (
                <option key={c.nome} value={c.nome}>{c.nome} ({c.lotes.length} lotes)</option>
              ))}
              <option value="novo">+ Novo comprador</option>
            </select>
          </div>

          {destino === 'novo' && (
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Nome do novo comprador</label>
              <input value={novoNome} onChange={e => setNovoNome(e.target.value)}
                style={{ background: DARK, border: `1px solid ${BORDER}` }}
                className="w-full rounded-xl px-3 py-2 text-sm text-white"
                placeholder="Nome completo" />
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={handleTransferir} disabled={saving || (!destino || (destino === 'novo' && !novoNome))}
            style={{ background: GOLD }}
            className="flex-1 text-black font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
            {saving ? 'Transferindo...' : 'Confirmar'}
          </button>
          <button onClick={onClose} 
            style={{ border: `1px solid ${BORDER}` }}
            className="flex-1 text-gray-300 py-2.5 rounded-xl text-sm hover:bg-white/5">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// MODAL: Adicionar Lote a Comprador Existente
// ============================================================
function ModalAdicionarLote({ comprador, lotesDisponiveis, vendas, onClose, onSave }) {
  const [lote, setLote] = useState('')
  const [valorArremate, setValorArremate] = useState('')
  const [origem, setOrigem] = useState('leiloesbr')
  const [saving, setSaving] = useState(false)

  // Lotes que ainda NÃO foram vendidos (exclui os que esse comprador já tem)
  const lotesJaVendidos = new Set(vendas.map(v => v.lote))
  const lotesDisponiveisFiltrados = lotesDisponiveis.filter(l => 
    !lotesJaVendidos.has(l.lote) || comprador.lotes.some(cl => cl.lote === l.lote)
  )
  const lotesNaoVendidos = lotesDisponiveis.filter(l => !lotesJaVendidos.has(l.lote))

  const loteSelecionado = lotesNaoVendidos.find(l => l.lote === parseInt(lote))

  async function handleAdicionar() {
    if (!lote) return
    setSaving(true)
    
    await supabase.from('spiti_vendas').insert({
      leilao_id: 'spiti9',
      lote: parseInt(lote),
      artista: loteSelecionado?.artista || 'PENDENTE',
      comprador_nome: comprador.nome,
      comprador_id: comprador.id || null,
      valor_arremate: parseFloat(valorArremate) || loteSelecionado?.valor_base || 0,
      data_venda: new Date().toISOString().split('T')[0],
      origem: origem,
      lancado: false
    })
    
    onSave()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] p-4">
      <div style={{ background: CARD, border: `1px solid ${BORDER}` }} className="rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-white font-semibold mb-1">+ Adicionar Lote</h3>
        <p className="text-gray-500 text-xs mb-4">
          Adicionar lote a {comprador.nome}
        </p>

        <div className="space-y-3">
          {/* Lote */}
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Lote *</label>
            {lotesNaoVendidos.length === 0 ? (
              <div style={{ background: '#C9A84C20', border: `1px solid ${GOLD}40` }} className="rounded-xl p-3 text-xs text-yellow-400">
                ⚠ Todos os lotes já foram vendidos.
              </div>
            ) : (
              <select value={lote} onChange={e => {
                setLote(e.target.value)
                const l = lotesNaoVendidos.find(lot => lot.lote === parseInt(e.target.value))
                if (l) setValorArremate(String(l.valor_base || 0))
              }}
                style={{ background: DARK, border: `1px solid ${BORDER}` }}
                className="w-full rounded-xl px-3 py-2 text-sm text-white">
                <option value="">Selecione...</option>
                {lotesNaoVendidos.map(l => (
                  <option key={l.lote} value={l.lote}>
                    Lote {l.lote} — {l.artista} (R$ {l.valor_base?.toLocaleString('pt-BR')})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Valor Arremate */}
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Valor do Arremate (R$)</label>
            <input type="number" value={valorArremate} onChange={e => setValorArremate(e.target.value)}
              style={{ background: DARK, border: `1px solid ${BORDER}` }}
              className="w-full rounded-xl px-3 py-2 text-sm text-white"
              placeholder="0" />
          </div>

          {/* Origem */}
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Origem</label>
            <select value={origem} onChange={e => setOrigem(e.target.value)}
              style={{ background: DARK, border: `1px solid ${BORDER}` }}
              className="w-full rounded-xl px-3 py-2 text-sm text-white">
              <option value="leiloesbr">Leilão (leiloesbr)</option>
              <option value="pos-leilao">Pós-Leilão</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={handleAdicionar} disabled={saving || !lote}
            style={{ background: GOLD }}
            className="flex-1 text-black font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
            {saving ? 'Adicionando...' : 'Adicionar'}
          </button>
          <button onClick={onClose}
            style={{ border: `1px solid ${BORDER}` }}
            className="flex-1 text-gray-300 py-2.5 rounded-xl text-sm hover:bg-white/5">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// MODAL 1: Novo Cliente (cadastro manual completo)
// ============================================================
function ModalNovoCliente({ onClose, onSave }) {
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [endereco, setEndereco] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cartela, setCartela] = useState('')
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCriar() {
    if (!nome.trim()) return
    setSaving(true)
    
    // Criar cliente na tabela spiti_clientes
    const { error } = await supabase.from('spiti_clientes').insert({
      leilao_id: 'spiti9',
      nome: nome.trim(),
      cpf: cpf.trim() || null,
      endereco: endereco.trim() || null,
      email: email.trim() || null,
      telefone: telefone.trim() || null,
      cartela: cartela.trim() || null,
      notas: notas.trim() || null
    })
    
    if (error) {
      console.error('Erro ao criar cliente:', error)
      alert('Erro ao criar cliente: ' + error.message)
      setSaving(false)
      return
    }
    
    onSave()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4">
      <div style={{ background: CARD, border: `1px solid ${BORDER}` }} className="rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-white font-semibold mb-1">+ Novo Cliente</h3>
        <p className="text-gray-500 text-xs mb-4">Cadastro completo do cliente</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Nome completo *</label>
            <input value={nome} onChange={e => setNome(e.target.value)}
              style={{ background: DARK, border: `1px solid ${BORDER}` }}
              className="w-full rounded-xl px-3 py-2 text-sm text-white"
              placeholder="Nome completo" autoFocus />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">CPF</label>
            <input value={cpf} onChange={e => setCpf(e.target.value)}
              style={{ background: DARK, border: `1px solid ${BORDER}` }}
              className="w-full rounded-xl px-3 py-2 text-sm text-white"
              placeholder="000.000.000-00" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Endereço</label>
            <input value={endereco} onChange={e => setEndereco(e.target.value)}
              style={{ background: DARK, border: `1px solid ${BORDER}` }}
              className="w-full rounded-xl px-3 py-2 text-sm text-white"
              placeholder="Rua, número, bairro, cidade" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                style={{ background: DARK, border: `1px solid ${BORDER}` }}
                className="w-full rounded-xl px-3 py-2 text-sm text-white"
                placeholder="email@exemplo.com" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Telefone</label>
              <input value={telefone} onChange={e => setTelefone(e.target.value)}
                style={{ background: DARK, border: `1px solid ${BORDER}` }}
                className="w-full rounded-xl px-3 py-2 text-sm text-white"
                placeholder="(00) 00000-0000" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Cartela (opcional)</label>
            <input value={cartela} onChange={e => setCartela(e.target.value)}
              style={{ background: DARK, border: `1px solid ${BORDER}` }}
              className="w-full rounded-xl px-3 py-2 text-sm text-white"
              placeholder="Número da cartela" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Notas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)}
              style={{ background: DARK, border: `1px solid ${BORDER}` }}
              className="w-full rounded-xl px-3 py-2 text-sm text-white resize-none h-16"
              placeholder="Observações..." />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={handleCriar} disabled={saving || !nome.trim()}
            style={{ background: GOLD }}
            className="flex-1 text-black font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
            {saving ? 'Criando...' : 'Criar Cliente'}
          </button>
          <button onClick={onClose}
            style={{ border: `1px solid ${BORDER}` }}
            className="flex-1 text-gray-300 py-2.5 rounded-xl text-sm hover:bg-white/5">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// MODAL 2: Nova Venda (vincular lote(s) a cliente)
// ============================================================
function ModalNovaVenda({ clientes, lotesDisponiveis, vendas, onClose, onSave }) {
  const [cliente, setCliente] = useState('')
  const [novoClienteNome, setNovoClienteNome] = useState('')
  const [lote, setLote] = useState('')
  const [lotesSelecionados, setLotesSelecionados] = useState([])
  const [origem, setOrigem] = useState('leiloesbr')
  const [valorArremate, setValorArremate] = useState('')
  const [comissaoCompradorPct, setComissaoCompradorPct] = useState('')
  const [comissaoConsignantePct, setComissaoConsignantePct] = useState('')
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [clientesList, setClientesList] = useState([])

  // Carregar clientes da tabela spiti_clientes
  useEffect(() => {
    async function loadClientes() {
      const { data } = await supabase.from('spiti_clientes').select('*').eq('leilao_id', 'spiti9').order('nome')
      if (data) setClientesList(data)
    }
    loadClientes()
  }, [])

  const isPosLeilao = origem === 'pos-leilao'

  function adicionarLote() {
    if (!lote) return
    const loteInfo = lotesDisponiveis.find(l => l.lote === parseInt(lote))
    if (loteInfo && !lotesSelecionados.some(l => l.lote === loteInfo.lote)) {
      setLotesSelecionados([...lotesSelecionados, loteInfo])
      setLote('')
    }
  }

  function removerLote(loteNum) {
    setLotesSelecionados(lotesSelecionados.filter(l => l.lote !== loteNum))
  }

  async function handleCriar() {
    if (!cliente && !novoClienteNome) return
    if (lotesSelecionados.length === 0) return
    
    setSaving(true)
    const nomeCliente = cliente === 'novo' ? novoClienteNome : cliente
    const clienteInfo = clientesList.find(c => c.id === cliente)
    
    const vendasData = lotesSelecionados.map(loteInfo => ({
      leilao_id: 'spiti9',
      lote: loteInfo.lote,
      artista: loteInfo.artista || 'PENDENTE',
      comprador_nome: nomeCliente,
      comprador_id: clienteInfo?.id || null,
      comprador_cartela: clienteInfo?.cartela || null,
      valor_arremate: parseFloat(valorArremate) || loteInfo.valor_base || 0,
      data_venda: new Date().toISOString().split('T')[0],
      origem: origem,
      notas: notas,
      lancado: false
    }))
    
    await supabase.from('spiti_vendas').insert(vendasData)
    
    onSave()
    onClose()
  }

  const clientesAtivos = clientesList.length > 0 ? clientesList : clientes.filter(c => c.nome && c.nome !== 'PENDENTE')
  const lotesNaoVendidos = useMemo(() => {
    const lotesVendidos = new Set(vendas.map(v => v.lote))
    return lotesDisponiveis.filter(l => !lotesVendidos.has(l.lote) && !lotesSelecionados.some(s => s.lote === l.lote))
  }, [lotesDisponiveis, vendas, lotesSelecionados])

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4">
      <div style={{ background: CARD, border: `1px solid ${BORDER}` }} className="rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-white font-semibold mb-1">+ Nova Venda</h3>
        <p className="text-gray-500 text-xs mb-4">Vincular lote(s) a cliente</p>

        <div className="space-y-3">
          {/* Cliente */}
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Cliente *</label>
            <select value={cliente} onChange={e => setCliente(e.target.value)}
              style={{ background: DARK, border: `1px solid ${BORDER}` }}
              className="w-full rounded-xl px-3 py-2 text-sm text-white">
              <option value="">Selecione...</option>
              {clientesAtivos.map(c => (
                <option key={c.id || c.nome} value={c.id || c.nome}>
                  {c.nome} {c.telefone ? `• ${c.telefone}` : ''} {c.email ? `• ${c.email}` : ''}
                </option>
              ))}
              <option value="novo">+ Novo cliente</option>
            </select>
          </div>

          {cliente === 'novo' && (
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Nome do novo cliente *</label>
              <input value={novoClienteNome} onChange={e => setNovoClienteNome(e.target.value)}
                style={{ background: DARK, border: `1px solid ${BORDER}` }}
                className="w-full rounded-xl px-3 py-2 text-sm text-white"
                placeholder="Nome completo" />
            </div>
          )}

          {/* Lote */}
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Adicionar Lote *</label>
            {lotesDisponiveis.length === 0 ? (
              <div style={{ background: '#C9A84C20', border: `1px solid ${GOLD}40` }} className="rounded-xl p-3 text-xs text-yellow-400">
                ⚠ Nenhum lote no catálogo. Cadastre lotes primeiro.
              </div>
            ) : lotesNaoVendidos.length === 0 ? (
              <div style={{ background: '#C9A84C20', border: `1px solid ${GOLD}40` }} className="rounded-xl p-3 text-xs text-yellow-400">
                ⚠ Todos os {lotesDisponiveis.length} lotes já foram vendidos.
              </div>
            ) : (
              <div className="flex gap-2">
                <select value={lote} onChange={e => setLote(e.target.value)}
                  style={{ background: DARK, border: `1px solid ${BORDER}` }}
                  className="flex-1 rounded-xl px-3 py-2 text-sm text-white">
                  <option value="">Selecione...</option>
                  {lotesNaoVendidos.map(l => (
                    <option key={l.lote} value={l.lote}>Lote {l.lote} — {l.artista} (R$ {l.valor_base?.toLocaleString('pt-BR')})</option>
                  ))}
                </select>
                <button onClick={adicionarLote} disabled={!lote}
                  style={{ background: GOLD }}
                  className="px-4 text-black font-semibold py-2 rounded-xl text-sm disabled:opacity-50">
                  +
                </button>
              </div>
            )}
          </div>

          {/* Lotes Selecionados */}
          {lotesSelecionados.length > 0 && (
            <div>
              <label className="text-xs text-gray-400 block mb-1.5">Lotes selecionados ({lotesSelecionados.length})</label>
              <div style={{ background: DARK, border: `1px solid ${BORDER}` }} className="rounded-xl p-3 space-y-2 max-h-40 overflow-y-auto">
                {lotesSelecionados.map(l => (
                  <div key={l.lote} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">Lote {l.lote} — {l.artista}</span>
                    <button onClick={() => removerLote(l.lote)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Origem */}
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Origem da venda</label>
            <select value={origem} onChange={e => setOrigem(e.target.value)}
              style={{ background: DARK, border: `1px solid ${BORDER}` }}
              className="w-full rounded-xl px-3 py-2 text-sm text-white">
              <option value="leiloesbr">Leilão (leiloesbr)</option>
              <option value="pos-leilao">🏷️ Pós-Leilão (negociada)</option>
            </select>
          </div>

          {/* Campos pós-leilão */}
          {isPosLeilao && (
            <>
              <div style={{ background: '#C9A84C20', border: `1px solid ${GOLD}40` }} className="rounded-xl p-3 space-y-3">
                <p className="text-xs" style={{ color: GOLD }}>🏷️ Venda Pós-Leilão — Comissões customizáveis</p>
                
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Valor do Arremate (R$) *</label>
                  <input type="number" value={valorArremate} onChange={e => setValorArremate(e.target.value)}
                    style={{ background: DARK, border: `1px solid ${BORDER}` }}
                    className="w-full rounded-xl px-3 py-2 text-sm text-white"
                    placeholder="0" />
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Comissão Comprador (%)</label>
                    <input type="number" value={comissaoCompradorPct} onChange={e => setComissaoCompradorPct(e.target.value)}
                      style={{ background: DARK, border: `1px solid ${BORDER}` }}
                      className="w-full rounded-xl px-3 py-2 text-sm text-white"
                      placeholder="Padrão: 10%" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Comissão Consignante (%)</label>
                    <input type="number" value={comissaoConsignantePct} onChange={e => setComissaoConsignantePct(e.target.value)}
                      style={{ background: DARK, border: `1px solid ${BORDER}` }}
                      className="w-full rounded-xl px-3 py-2 text-sm text-white"
                      placeholder="Do lote" />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Notas */}
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Notas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)}
              style={{ background: DARK, border: `1px solid ${BORDER}` }}
              className="w-full rounded-xl px-3 py-2 text-sm text-white resize-none h-16"
              placeholder="Observações..." />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={handleCriar} disabled={saving || (!cliente && !novoClienteNome) || lotesSelecionados.length === 0}
            style={{ background: GOLD }}
            className="flex-1 text-black font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
            {saving ? 'Criando...' : `Criar Venda (${lotesSelecionados.length} lote${lotesSelecionados.length !== 1 ? 's' : ''})`}
          </button>
          <button onClick={onClose}
            style={{ border: `1px solid ${BORDER}` }}
            className="flex-1 text-gray-300 py-2.5 rounded-xl text-sm hover:bg-white/5">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// Modal Principal - Editar Pedido Completo
function ModalPedido({ comprador, allCompradores, onClose, onSave, onAdicionarLote }) {
  const [parcelas, setParcelas] = useState([])
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [loteTransferir, setLoteTransferir] = useState(null)
  const [recebimentos, setRecebimentos] = useState([])
  const [lotesLocal, setLotesLocal] = useState([])
  const [lotesRemovidos, setLotesRemovidos] = useState([])
  const [comissaoCustom, setComissaoCustom] = useState(null)
  const [editandoComissao, setEditandoComissao] = useState(false)
  const [editandoLote, setEditandoLote] = useState(null) // lote sendo editado

  // Sincronizar lotesLocal quando comprador muda
  useEffect(() => {
    if (comprador?.lotes) {
      setLotesLocal(comprador.lotes)
    }
  }, [comprador])

  // Recalcular totais baseado em lotesLocal
  const arremateLocal = lotesLocal.reduce((sum, l) => sum + (l.valor || 0), 0)
  const comissaoLocal = lotesLocal.reduce((sum, l) => sum + calcularComissaoComprador(l.valor || 0), 0)
  const totalLocal = arremateLocal + (comissaoCustom !== null ? parseFloat(comissaoCustom) : comissaoLocal)

  // Carregar parcelas existentes
  useEffect(() => {
    async function loadParcelas() {
      if (comprador?.cobranca?.id) {
        const { data } = await supabase.from('spiti_parcelas')
          .select('*')
          .eq('cobranca_id', comprador.cobranca.id)
          .order('numero')
        if (data?.length) {
          setParcelas(data.map(p => ({
            id: p.id,
            valor: p.valor,
            forma: p.forma_pagamento || 'PIX',
            vencimento: p.data_vencimento || '',
            status: p.status,
            dataPagamento: p.data_pagamento
          })))
        }
        setNotas(comprador.cobranca.notas || '')
        
        if (comprador.cobranca.comissao_total !== undefined) {
          setComissaoCustom(comprador.cobranca.comissao_total)
        }

        const { data: recData } = await supabase.from('spiti_recebimentos')
          .select('*')
          .eq('cobranca_id', comprador.cobranca.id)
          .order('data_recebimento', { ascending: false })
        setRecebimentos(recData || [])
      }
    }
    loadParcelas()

    if (!comprador?.cobranca?.id) {
      setParcelas([{ valor: comprador?.total || 0, forma: 'PIX', vencimento: new Date().toISOString().split('T')[0], status: 'pendente' }])
    }
  }, [comprador])

  const totalParcelas = parcelas.reduce((sum, p) => sum + (parseFloat(p.valor) || 0), 0)
  const diferenca = totalLocal - totalParcelas

  function addParcela() {
    const restante = Math.max(0, totalLocal - totalParcelas)
    const hoje = new Date()
    hoje.setDate(hoje.getDate() + 30 * parcelas.length)
    setParcelas([...parcelas, { valor: restante, forma: 'CHEQUE', vencimento: hoje.toISOString().split('T')[0], status: 'pendente' }])
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
    const valorParcela = totalLocal / parcelas.length
    const hoje = new Date()
    setParcelas(parcelas.map((p, i) => {
      const venc = new Date(hoje)
      venc.setDate(venc.getDate() + 30 * i)
      return { ...p, valor: valorParcela, vencimento: venc.toISOString().split('T')[0] }
    }))
  }

  async function handleSalvar() {
    if (Math.abs(diferenca) > 1) {
      alert('A soma das parcelas deve ser igual ao total!')
      return
    }
    setSaving(true)

    const parcelasPagas = parcelas.filter(p => p.status === 'pago').length
    const valorPago = parcelas.filter(p => p.status === 'pago').reduce((sum, p) => sum + parseFloat(p.valor || 0), 0)
    let statusCobranca = 'pendente'
    if (parcelasPagas === parcelas.length) statusCobranca = 'pago'
    else if (parcelasPagas > 0) statusCobranca = 'parcial'

    if (lotesLocal.length === 0) {
      if (comprador.cobranca?.id) {
        await supabase.from('spiti_parcelas').delete().eq('cobranca_id', comprador.cobranca.id)
        await supabase.from('spiti_cobrancas').delete().eq('id', comprador.cobranca.id)
      }
      onSave(); onClose()
      return
    }

    const { data: cobranca } = await supabase.from('spiti_cobrancas').upsert({
      id: comprador.cobranca?.id,
      leilao_id: 'spiti9',
      comprador_nome: comprador.nome,
      comprador_id: comprador.id,
      lotes: lotesLocal.map(l => l.lote),
      valor_arremate_total: arremateLocal,
      comissao_total: comissaoCustom !== null ? parseFloat(comissaoCustom) : comissaoLocal,
      valor_total: totalLocal,
      forma_pagamento: parcelas.map(p => p.forma).join(', '),
      num_parcelas: parcelas.length,
      valor_pago: valorPago,
      status: statusCobranca,
      lancado: true,
      lancado_em: comprador.cobranca?.lancado_em || new Date().toISOString(),
      notas
    }, { onConflict: 'id' }).select().single()

    if (cobranca) {
      await supabase.from('spiti_parcelas').delete().eq('cobranca_id', cobranca.id)

      const parcelasData = parcelas.map((p, i) => ({
        cobranca_id: cobranca.id,
        numero: i + 1,
        valor: parseFloat(p.valor),
        forma_pagamento: p.forma,
        data_vencimento: p.vencimento,
        status: p.status || 'pendente',
        data_pagamento: p.dataPagamento
      }))
      await supabase.from('spiti_parcelas').insert(parcelasData)

      await supabase.from('spiti_vendas')
        .update({ lancado: true })
        .eq('leilao_id', 'spiti9')
        .in('lote', lotesLocal.map(l => l.lote))
    }

    onSave(); onClose()
  }

  function handleTransferido() {
    setLoteTransferir(null)
    onSave()
    onClose()
  }

  async function handleRemoverLote(lote) {
    if (!confirm(`Remover lote ${lote.lote} (${lote.artista}) deste pedido?`)) return
    setLotesLocal(prev => prev.filter(l => l.lote !== lote.lote))
    setLotesRemovidos(prev => [...prev, lote.lote])
    await supabase.from('spiti_vendas')
      .update({ lancado: false })
      .eq('lote', lote.lote)
      .eq('leilao_id', 'spiti9')
  }

  async function handleDeletarVenda(lote) {
    if (!confirm(`DELETAR PERMANENTEMENTE a venda do lote ${lote.lote}?\n\nIsso remove o registro de venda completamente.`)) return
    await supabase.from('spiti_vendas')
      .delete()
      .eq('lote', lote.lote)
      .eq('leilao_id', 'spiti9')
    setLotesLocal(prev => prev.filter(l => l.lote !== lote.lote))
    setLotesRemovidos(prev => [...prev, lote.lote])
  }

  if (!comprador) return null

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: CARD, border: `1px solid ${BORDER}` }} className="rounded-2xl w-full max-w-3xl shadow-2xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }} className="px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-white">{comprador?.nome || 'Comprador'}</h2>
              {comprador?.lancado && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  comprador.cobranca?.status === 'pago' ? 'bg-green-500/20 text-green-400' :
                  comprador.cobranca?.status === 'parcial' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {comprador.cobranca?.status || 'pendente'}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {comprador?.lancado ? `Lançado em ${comprador.cobranca?.lancado_em?.split('T')[0]}` : 'Não lançado'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onAdicionarLote}
              style={{ background: GOLD }}
              className="px-3 py-1.5 rounded-lg text-sm text-black font-semibold hover:opacity-80"
            >
              + Adicionar Lote
            </button>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
          </div>
        </div>

        {/* Content */}
        <div style={{ background: CARD }} className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* Lotes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Lotes ({lotesLocal.length})</h3>
              {lotesRemovidos.length > 0 && (
                <span className="text-xs text-yellow-400">{lotesRemovidos.length} removido(s)</span>
              )}
            </div>
            <div style={{ background: DARK, border: `1px solid ${BORDER}` }} className="rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500" style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <th className="text-left px-4 py-2">Lote</th>
                    <th className="text-left px-4 py-2">Artista</th>
                    <th className="text-right px-4 py-2">Arremate</th>
                    <th className="text-right px-4 py-2">Comissão</th>
                    <th className="text-right px-4 py-2">Total</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {lotesLocal.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-6 text-gray-600">Nenhum lote neste pedido</td></tr>
                  ) : (
                    lotesLocal.map(l => {
                      const comissao = calcularComissaoComprador(l.valor)
                      const total = calcularTotalComprador(l.valor)
                      const isEditing = editandoLote === l.lote
                      return (
                        <tr key={l.lote} className="hover:bg-white/[0.02] group" style={{ borderBottom: `1px solid ${BORDER}30` }}>
                          <td className="px-4 py-2 font-mono text-gray-400">{l.lote}</td>
                          <td className="px-4 py-2 text-gray-300 truncate max-w-[150px]">{l.artista}</td>
                          <td className="px-4 py-2 text-right">
                            {isEditing ? (
                              <div className="flex items-center gap-1 justify-end">
                                <span className="text-gray-500 text-xs">R$</span>
                                <input 
                                  type="number" 
                                  defaultValue={l.valor}
                                  onBlur={(e) => {
                                    const novoValor = parseFloat(e.target.value) || 0
                                    setLotesLocal(prev => prev.map(lote => 
                                      lote.lote === l.lote ? { ...lote, valor: novoValor } : lote
                                    ))
                                    // Atualizar no banco
                                    supabase.from('spiti_vendas')
                                      .update({ valor_arremate: novoValor })
                                      .eq('lote', l.lote)
                                      .eq('leilao_id', 'spiti9')
                                      .then(() => {})
                                    setEditandoLote(null)
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') e.target.blur()
                                    if (e.key === 'Escape') setEditandoLote(null)
                                  }}
                                  style={{ background: CARD, border: `1px solid ${GOLD}80` }}
                                  className="w-24 rounded px-2 py-1 text-sm text-white text-right font-mono"
                                  autoFocus
                                />
                              </div>
                            ) : (
                              <span 
                                onClick={(e) => { e.stopPropagation(); setEditandoLote(l.lote) }}
                                className="text-white font-mono cursor-pointer hover:text-yellow-400 transition-colors"
                                title="Clique para editar"
                              >
                                {formatCurrency(l.valor)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-500 font-mono text-xs">{formatCurrency(comissao)} <span className="text-gray-600">({((comissao / (l.valor || 1)) * 100).toFixed(1)}%)</span></td>
                          <td className="px-4 py-2 text-right font-mono font-medium" style={{ color: GOLD }}>{formatCurrency(total)}</td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setLoteTransferir(l)}
                                className="text-xs text-gray-500 hover:text-yellow-400 transition-colors" title="Transferir">⇄</button>
                              <button onClick={() => handleRemoverLote(l)}
                                className="text-xs text-gray-500 hover:text-yellow-400 transition-colors" title="Remover">−</button>
                              <button onClick={() => handleDeletarVenda(l)}
                                className="text-xs text-gray-500 hover:text-red-400 transition-colors" title="Deletar">✕</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-white/[0.02]">
                    <td colSpan={2} className="px-4 py-2 text-gray-500 text-xs">Total</td>
                    <td className="px-4 py-2 text-right text-white font-mono font-medium">{formatCurrency(arremateLocal)}</td>
                    <td className="px-4 py-2 text-right">
                      {editandoComissao ? (
                        <div className="flex items-center gap-1 justify-end">
                          <span className="text-gray-500 text-xs">R$</span>
                          <input 
                            type="number" 
                            value={comissaoCustom !== null ? comissaoCustom : comissaoLocal}
                            onChange={e => setComissaoCustom(e.target.value)}
                            style={{ background: CARD, border: `1px solid ${GOLD}80` }}
                            className="w-24 rounded px-2 py-1 text-sm text-white text-right font-mono"
                            autoFocus
                          />
                          <button onClick={() => setEditandoComissao(false)} className="text-green-400 text-xs ml-1">✓</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 justify-end">
                          <span className={`font-mono ${comissaoCustom !== null && comissaoCustom != comissaoLocal ? 'text-yellow-400' : 'text-gray-500'}`}>
                            {formatCurrency(comissaoCustom !== null ? parseFloat(comissaoCustom) : comissaoLocal)}
                          </span>
                          <span className="text-gray-600 text-xs">({arremateLocal > 0 ? ((comissaoCustom !== null ? parseFloat(comissaoCustom) : comissaoLocal) / arremateLocal * 100).toFixed(1) : '0'}%)</span>
                          <button onClick={() => setEditandoComissao(true)} className="text-xs text-gray-600 hover:text-yellow-400">✎</button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-bold" style={{ color: GOLD }}>{formatCurrency(totalLocal)}</td>
                    <td></td>
                  </tr>
                  {comissaoCustom !== null && parseFloat(comissaoCustom) !== comissaoLocal && (
                    <tr className="bg-yellow-500/5">
                      <td colSpan={6} className="px-4 py-1 text-xs text-yellow-400">
                        ⚠ Comissão ajustada: {formatCurrency(comissaoLocal)} → {formatCurrency(parseFloat(comissaoCustom))} 
                        (desconto de {formatCurrency(comissaoLocal - parseFloat(comissaoCustom))})
                        <button onClick={() => setComissaoCustom(null)} className="ml-2 text-gray-500 hover:text-white">Resetar</button>
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </div>

          {/* Parcelas */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Parcelas</h3>
              <div className="flex gap-2">
                <button onClick={distribuirIgual} className="text-xs text-gray-400 hover:text-white">Distribuir igual</button>
                <button onClick={addParcela} className="text-xs font-medium" style={{ color: GOLD }}>+ Adicionar</button>
              </div>
            </div>

            <div className="space-y-2">
              {parcelas.map((p, idx) => (
                <div key={idx} style={{ background: DARK, border: `1px solid ${BORDER}` }} className="rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500 font-medium">
                      Parcela {idx + 1}
                      {p.status === 'pago' && <span className="ml-2 text-green-400">✓ Paga</span>}
                    </span>
                    {parcelas.length > 1 && p.status !== 'pago' && (
                      <button onClick={() => removeParcela(idx)} className="text-xs text-red-400 hover:text-red-300">✕</button>
                    )}
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    <div>
                      <label className="text-2xs text-gray-500 block mb-1">Valor</label>
                      <input type="number" value={p.valor} onChange={e => updateParcela(idx, 'valor', e.target.value)}
                        disabled={p.status === 'pago'}
                        style={{ background: CARD, border: `1px solid ${BORDER}` }}
                        className="w-full rounded-lg px-2 py-1.5 text-sm text-white disabled:opacity-50" />
                    </div>
                    <div>
                      <label className="text-2xs text-gray-500 block mb-1">Forma</label>
                      <select value={p.forma} onChange={e => updateParcela(idx, 'forma', e.target.value)}
                        disabled={p.status === 'pago'}
                        style={{ background: CARD, border: `1px solid ${BORDER}` }}
                        className="w-full rounded-lg px-2 py-1.5 text-sm text-white disabled:opacity-50">
                        {['PIX', 'TED', 'CHEQUE', 'BOLETO', 'CARTÃO', 'DINHEIRO'].map(f => <option key={f}>{f}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-2xs text-gray-500 block mb-1">Vencimento</label>
                      <input type="date" value={p.vencimento} onChange={e => updateParcela(idx, 'vencimento', e.target.value)}
                        disabled={p.status === 'pago'}
                        style={{ background: CARD, border: `1px solid ${BORDER}` }}
                        className="w-full rounded-lg px-2 py-1.5 text-sm text-white disabled:opacity-50" />
                    </div>
                    <div>
                      <label className="text-2xs text-gray-500 block mb-1">Data Pagamento</label>
                      <input type="date" value={p.dataPagamento || ''} onChange={e => updateParcela(idx, 'dataPagamento', e.target.value)}
                        disabled={p.status !== 'pago'}
                        style={{ background: CARD, border: `1px solid ${BORDER}` }}
                        className="w-full rounded-lg px-2 py-1.5 text-sm text-white disabled:opacity-50" />
                    </div>
                    <div>
                      <label className="text-2xs text-gray-500 block mb-1">Status</label>
                      <select value={p.status || 'pendente'} onChange={e => updateParcela(idx, 'status', e.target.value)}
                        className={`w-full border rounded-lg px-2 py-1.5 text-sm text-center cursor-pointer ${
                          p.status === 'pago' ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400'
                        }`}>
                        <option value="pendente">Pendente</option>
                        <option value="pago">✓ Pago</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Validação */}
            <div className={`text-xs px-3 py-2 rounded-lg mt-3 ${Math.abs(diferenca) < 1 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
              {Math.abs(diferenca) < 1
                ? `✓ Total das parcelas: ${formatCurrency(totalParcelas)}`
                : `⚠ Diferença de ${formatCurrency(diferenca)} (total parcelas: ${formatCurrency(totalParcelas)})`
              }
            </div>
          </div>

          {/* Histórico de Pagamentos */}
          {recebimentos.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-3">Histórico de Pagamentos</h3>
              <div style={{ background: DARK, border: `1px solid ${BORDER}` }} className="rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500" style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <th className="text-left px-4 py-2">Data</th>
                      <th className="text-left px-4 py-2">Valor</th>
                      <th className="text-left px-4 py-2">Forma</th>
                      <th className="text-left px-4 py-2">Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recebimentos.map(r => (
                      <tr key={r.id} style={{ borderBottom: `1px solid ${BORDER}30` }}>
                        <td className="px-4 py-2 text-gray-400 font-mono">{r.data_recebimento}</td>
                        <td className="px-4 py-2 text-green-400 font-mono">{formatCurrency(r.valor)}</td>
                        <td className="px-4 py-2 text-gray-400">{r.forma_pagamento}</td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{r.notas || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Notas */}
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">Notas do Pedido</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)}
              style={{ background: DARK, border: `1px solid ${BORDER}` }}
              className="w-full rounded-xl px-3 py-2 text-sm text-white resize-none h-16"
              placeholder="Observações gerais..." />
          </div>
        </div>

        {/* Footer */}
        <div style={{ background: CARD, borderTop: `1px solid ${BORDER}` }} className="px-6 py-4 flex gap-3 shrink-0">
          <button onClick={handleSalvar} disabled={saving || Math.abs(diferenca) > 1}
            style={{ background: GOLD }}
            className="flex-1 text-black font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50">
            {saving ? 'Salvando...' : comprador?.lancado ? 'Salvar Alterações' : 'Lançar Pedido'}
          </button>
          <button onClick={onClose}
            style={{ border: `1px solid ${BORDER}` }}
            className="flex-1 text-gray-300 py-2.5 rounded-xl text-sm hover:bg-white/5 transition-colors">
            Cancelar
          </button>
        </div>
      </div>

      {/* Modal de Transferência */}
      {loteTransferir && (
        <ModalTransferir
          lote={loteTransferir}
          compradores={allCompradores}
          currentComprador={comprador?.nome}
          onClose={() => setLoteTransferir(null)}
          onSave={handleTransferido}
        />
      )}
    </div>
  )
}

const SORT_OPTIONS = [
  { value: 'total', label: 'Valor' },
  { value: 'lotes', label: 'Qtd Lotes' },
  { value: 'nome', label: 'Nome' },
]

export default function Vendas() {
  const [vendas, setVendas] = useState([])
  const [cobrancas, setCobrancas] = useState([])
  const [lotesCatalogo, setLotesCatalogo] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [sortBy, setSortBy] = useState('total')
  const [sortDir, setSortDir] = useState('desc')
  const [modal, setModal] = useState(null)
  const [modalNovaCliente, setModalNovaCliente] = useState(false)
  const [modalNovaVenda, setModalNovaVenda] = useState(false)
  const [modalAdicionarLote, setModalAdicionarLote] = useState(null)

  async function load() {
    const [{ data: vendasData, error: errVendas }, { data: cobrancasData, error: errCobrancas }, { data: lotesData, error: errLotes }] = await Promise.all([
      supabase.from('spiti_vendas').select('*').eq('leilao_id', 'spiti9').order('lote'),
      supabase.from('spiti_cobrancas').select('*').eq('leilao_id', 'spiti9'),
      supabase.from('spiti_lotes_financeiro').select('*').eq('leilao_id', 'spiti9').order('lote')
    ])
    console.log('DEBUG Vendas:', { vendasData, errVendas })
    console.log('DEBUG Lotes:', { lotesData, errLotes })
    setVendas(vendasData || [])
    setCobrancas(cobrancasData || [])
    setLotesCatalogo(lotesData || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Agrupar vendas por comprador
  const compradores = useMemo(() => {
    const map = new Map()
    vendas.forEach(v => {
      const key = v.comprador_id || v.comprador_nome
      if (!map.has(key)) {
        map.set(key, {
          id: v.comprador_id,
          nome: v.comprador_nome,
          lotes: [],
          arremate: 0,
          comissao: 0,
          total: 0
        })
      }
      const c = map.get(key)
      c.lotes.push({ lote: v.lote, artista: v.artista, valor: v.valor_arremate })
      c.arremate += v.valor_arremate || 0
      c.comissao += calcularComissaoComprador(v.valor_arremate || 0)
      c.total += calcularTotalComprador(v.valor_arremate || 0)
    })

    map.forEach((c, key) => {
      const cobranca = cobrancas.find(cb => cb.comprador_id === key || cb.comprador_nome === c.nome)
      c.lancado = cobranca?.lancado || false
      c.cobranca = cobranca
    })

    return Array.from(map.values())
  }, [vendas, cobrancas])

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir(col === 'nome' ? 'asc' : 'desc') }
  }

  const filtered = compradores
    .filter(c => {
      if (filtro === 'lancado' && !c.lancado) return false
      if (filtro === 'pendente' && c.lancado) return false
      if (busca && !c.nome?.toLowerCase().includes(busca.toLowerCase()) && !c.lotes.some(l => String(l.lote).includes(busca))) return false
      return true
    })
    .sort((a, b) => {
      let va, vb
      if (sortBy === 'total') { va = a.total; vb = b.total }
      else if (sortBy === 'lotes') { va = a.lotes.length; vb = b.lotes.length }
      else if (sortBy === 'nome') { va = a.nome || ''; vb = b.nome || '' }
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
    })

  const totais = compradores.reduce((acc, c) => {
    acc.arremate += c.arremate
    acc.total += c.total
    if (c.lancado) acc.lancado += c.total
    else acc.pendente += c.total
    return acc
  }, { arremate: 0, total: 0, lancado: 0, pendente: 0 })

  function SortIcon({ col }) {
    if (sortBy !== col) return <span className="text-gray-700 ml-1">↕</span>
    return <span style={{ color: GOLD }} className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Vendas</h1>
          <p className="text-gray-500 text-sm">Pedidos agrupados por comprador</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-xs text-gray-500 mr-4">
            {vendas.length} lotes • {compradores.length} compradores
          </div>
          <button onClick={() => setModalNovaCliente(true)}
            style={{ background: CARD, border: `1px solid ${BORDER}` }}
            className="px-4 py-2 rounded-xl text-sm text-gray-300 hover:text-white hover:border-gray-500 transition-colors">
            + Cliente
          </button>
          <button onClick={() => setModalNovaVenda(true)}
            style={{ background: GOLD }}
            className="px-4 py-2 rounded-xl text-sm text-black font-semibold hover:opacity-90 transition-opacity">
            + Nova Venda
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Arremates', val: totais.arremate, color: 'text-white' },
          { label: 'Total a Cobrar', val: totais.total, color: GOLD },
          { label: 'Lançadas', val: totais.lancado, color: '#4ADE80' },
          { label: 'Aguardando', val: totais.pendente, color: '#FACC15' },
        ].map(s => (
          <div key={s.label} style={{ background: CARD, border: `1px solid ${BORDER}` }} className="rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">{s.label}</div>
            <div className="text-xl font-bold" style={{ color: s.color }}>{formatCurrency(s.val)}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">🔍</span>
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar comprador ou lote..."
            style={{ background: CARD, border: `1px solid ${BORDER}` }}
            className="rounded-xl pl-8 pr-4 py-2 text-sm text-white w-72" />
        </div>
        <div style={{ background: CARD, border: `1px solid ${BORDER}` }} className="flex gap-1 rounded-xl p-1">
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'pendente', label: 'Aguardando' },
            { key: 'lancado', label: 'Lançadas' }
          ].map(f => (
            <button key={f.key} onClick={() => setFiltro(f.key)}
              style={filtro === f.key ? { background: GOLD, color: '#000' } : {}}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filtro !== f.key ? 'text-gray-400 hover:text-white' : ''
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto text-xs text-gray-500">
          Ordenar:
          {SORT_OPTIONS.map(o => (
            <button key={o.value} onClick={() => toggleSort(o.value)}
              style={sortBy === o.value ? { color: GOLD } : {}}
              className="px-2 py-1 rounded hover:text-white">
              {o.label}<SortIcon col={o.value} />
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: CARD, border: `1px solid ${BORDER}` }} className="rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium cursor-pointer hover:text-gray-300" onClick={() => toggleSort('nome')}>
                Comprador<SortIcon col="nome" />
              </th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium cursor-pointer hover:text-gray-300" onClick={() => toggleSort('lotes')}>
                Lotes<SortIcon col="lotes" />
              </th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Arremate</th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Comissão</th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium cursor-pointer hover:text-gray-300" onClick={() => toggleSort('total')}>
                Total<SortIcon col="total" />
              </th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Status</th>
              <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-600">Carregando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-600">Nenhum resultado</td></tr>
            ) : (
              filtered.map((c, i) => (
                <tr key={c.id || c.nome} 
                  onClick={() => setModal(c)}
                  style={{ borderBottom: `1px solid ${BORDER}40` }}
                  className={`transition-colors cursor-pointer hover:bg-white/[0.03] ${i % 2 !== 0 ? 'bg-white/[0.015]' : ''}`}>
                  <td className="px-4 py-3 text-white font-medium max-w-[200px] truncate">{c.nome}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-400 font-mono bg-white/5 px-2 py-1 rounded">
                      {c.lotes.length} {c.lotes.length === 1 ? 'lote' : 'lotes'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{formatCurrency(c.arremate)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatCurrency(c.comissao)}</td>
                  <td className="px-4 py-3 font-semibold" style={{ color: GOLD }}>{formatCurrency(c.total)}</td>
                  <td className="px-4 py-3">
                    {c.lancado ? (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        c.cobranca?.status === 'pago' ? 'bg-green-500/20 text-green-400' :
                        c.cobranca?.status === 'parcial' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {c.cobranca?.status === 'pago' ? '✓ Pago' : 
                         c.cobranca?.status === 'parcial' ? 'Parcial' : 
                         'Pendente'}
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-500/20 text-gray-400">Aguardando</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium" style={{ color: GOLD }}>
                      {c.lancado ? 'Editar' : 'Lançar'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); setModalAdicionarLote(c) }}
                      style={{ background: GOLD }}
                      className="px-2 py-1 rounded text-xs text-black font-bold hover:opacity-80"
                      title="Adicionar lote"
                    >
                      +
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div style={{ borderTop: `1px solid ${BORDER}` }} className="px-4 py-2 text-xs text-gray-600">
          {filtered.length} pedido{filtered.length !== 1 ? 's' : ''} • Clique para abrir
        </div>
      </div>

      {modal && <ModalPedido comprador={modal} allCompradores={compradores} onClose={() => setModal(null)} onSave={load} onAdicionarLote={() => { setModalAdicionarLote(modal); setModal(null) }} />}
      {modalNovaCliente && <ModalNovoCliente onClose={() => setModalNovaCliente(false)} onSave={load} />}
      {modalNovaVenda && <ModalNovaVenda clientes={compradores} lotesDisponiveis={lotesCatalogo} vendas={vendas} onClose={() => setModalNovaVenda(false)} onSave={load} />}
      {modalAdicionarLote && <ModalAdicionarLote comprador={modalAdicionarLote} lotesDisponiveis={lotesCatalogo} vendas={vendas} onClose={() => setModalAdicionarLote(null)} onSave={load} />}
    </div>
  )
}
