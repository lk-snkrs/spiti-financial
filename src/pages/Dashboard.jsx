import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency, calcularComissaoComprador, calcularTotalComprador } from '../lib/financeiro'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
} from 'recharts'

const GOLD = '#C9A84C'
const GOLD_LIGHT = '#E5C97A'
const CARD_BG = '#1A1A1A'
const BORDER = '#2A2A2A'

function StatCard({ label, value, sub, color = 'text-white' }) {
  return (
    <div style={{ background: CARD_BG, border: `1px solid ${BORDER}` }} className="rounded-xl p-5">
      <div className="text-xs text-gray-400 mb-1 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

const CATEGORY_COLORS = {
  'Produção': '#C9A84C',
  'Fotografia': '#4C9AC9',
  'Marketing': '#9A4CC9',
  'Plataforma': '#4CC99A',
  'Outros': '#C94C4C',
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 8 }} className="p-3">
        <p className="text-white text-sm font-medium mb-1">{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color }} className="text-xs">
            {p.name}: {formatCurrency(p.value)}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export default function Dashboard() {
  const [vendas, setVendas] = useState([])
  const [custos, setCustos] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedComprador, setExpandedComprador] = useState(null)

  useEffect(() => {
    async function load() {
      const [{ data: v }, { data: c }] = await Promise.all([
        supabase.from('spiti_vendas').select('*').eq('leilao_id', 'spiti9'),
        supabase.from('spiti_custos').select('*').eq('leilao_id', 'spiti9'),
      ])
      setVendas(v || [])
      setCustos(c || [])
      setLoading(false)
    }
    load()
  }, [])

  // ── Totais ──────────────────────────────────────────────────────────────────
  const totalArremate = vendas.reduce((s, v) => s + (v.valor_arremate || 0), 0)
  const totalAReceber = vendas.reduce((s, v) => s + calcularTotalComprador(v.valor_arremate || 0), 0)
  const totalComissoes = vendas.reduce((s, v) => s + calcularComissaoComprador(v.valor_arremate || 0), 0)
  const totalCustos = custos.reduce((s, c) => s + (c.valor || 0), 0)
  const resultadoLiquido = totalComissoes - totalCustos

  // ── Gráfico por dia ─────────────────────────────────────────────────────────
  const dia1 = vendas.filter(v => v.data_venda === '2026-03-31')
  const dia2 = vendas.filter(v => v.data_venda === '2026-04-01')
  const chartDias = [
    {
      dia: 'Dia 1 — 31/03',
      Arremate: dia1.reduce((s, v) => s + (v.valor_arremate || 0), 0),
      lotes: dia1.length,
    },
    {
      dia: 'Dia 2 — 01/04',
      Arremate: dia2.reduce((s, v) => s + (v.valor_arremate || 0), 0),
      lotes: dia2.length,
    },
  ]

  // ── Top 10 compradores por valor ────────────────────────────────────────────
  const compradorMap = {}
  for (const v of vendas) {
    const id = v.comprador_id || v.comprador_cartela || v.comprador_nome
    if (!compradorMap[id]) {
      compradorMap[id] = { id, nome: v.comprador_nome, total: 0, lotes: 0, itens: [] }
    }
    compradorMap[id].total += v.valor_arremate || 0
    compradorMap[id].lotes += 1
    compradorMap[id].itens.push({ lote: v.lote, artista: v.artista, valor: v.valor_arremate })
  }
  const top10Compradores = Object.values(compradorMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  // ── Custos por categoria ────────────────────────────────────────────────────
  const custosCatMap = {}
  for (const c of custos) {
    const cat = c.categoria || 'Outros'
    custosCatMap[cat] = (custosCatMap[cat] || 0) + (c.valor || 0)
  }
  const custosPorCategoria = Object.entries(custosCatMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 text-sm animate-pulse">Carregando dados...</div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">SPITI.AUCTION #9</h1>
        <p className="text-gray-400 text-sm">31 de Março e 1 de Abril de 2026 · {vendas.length} lotes vendidos</p>
      </div>

      {/* Cards principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Arremates"
          value={formatCurrency(totalArremate)}
          sub={`${vendas.length} lotes`}
          color="text-white"
        />
        <StatCard
          label="Total a Receber"
          value={formatCurrency(totalAReceber)}
          sub="incl. comissão compradores"
          color="text-yellow-300"
        />
        <StatCard
          label="Total Custos"
          value={formatCurrency(totalCustos)}
          sub={`${custos.length} lançamentos`}
          color="text-red-400"
        />
        <StatCard
          label="Resultado Líquido"
          value={formatCurrency(resultadoLiquido)}
          sub="comissões − custos"
          color={resultadoLiquido >= 0 ? 'text-green-400' : 'text-red-400'}
        />
      </div>

      {/* Gráfico por sessão + Top 10 compradores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Bar chart: Dia 1 vs Dia 2 */}
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}` }} className="rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-1 uppercase tracking-wide">Arrecadado por Sessão</h2>
          <p className="text-xs text-gray-500 mb-4">Lotes 1–129 (Dia 1) · Lotes 130–252 (Dia 2)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartDias} barSize={52} barCategoryGap="30%">
              <XAxis
                dataKey="dia"
                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#6B7280', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="Arremate" radius={[4, 4, 0, 0]}>
                <Cell fill={GOLD} />
                <Cell fill={GOLD_LIGHT} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-6 mt-3 text-xs text-gray-400">
            {chartDias.map((d, i) => (
              <div key={i}>
                <span className="font-semibold text-white">{d.lotes}</span> lotes ·{' '}
                <span style={{ color: i === 0 ? GOLD : GOLD_LIGHT }}>{formatCurrency(d.Arremate)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top 10 Compradores */}
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}` }} className="rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wide">Top 10 Compradores</h2>
          {top10Compradores.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-8">Sem dados</div>
          ) : (
            <div className="space-y-2">
              {top10Compradores.map((c, i) => {
                const maxVal = top10Compradores[0].total
                const pct = (c.total / maxVal) * 100
                const isExpanded = expandedComprador === c.id
                return (
                  <div key={i}>
                    <div 
                      className="flex items-center gap-3 cursor-pointer hover:bg-white/5 rounded-lg p-1 -m-1 transition-colors"
                      onClick={() => setExpandedComprador(isExpanded ? null : c.id)}
                    >
                      <span className="text-xs text-gray-500 w-5 shrink-0">{isExpanded ? '▼' : (i + 1)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs text-white truncate pr-2">{c.nome}</span>
                          <span className="text-xs font-semibold shrink-0" style={{ color: GOLD }}>
                            {formatCurrency(c.total)}
                          </span>
                        </div>
                        <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: i === 0 ? GOLD : GOLD_LIGHT, opacity: 1 - i * 0.07 }}
                          />
                        </div>
                        <span className="text-xs text-gray-600">{c.lotes} lote{c.lotes > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    {/* Cartela expandida */}
                    {isExpanded && (
                      <div className="ml-6 mt-2 mb-3 p-3 rounded-lg" style={{ background: '#0A0A0A', border: `1px solid ${BORDER}` }}>
                        <div className="text-xs text-gray-400 mb-2 font-medium">🎫 Cartela de {c.nome}</div>
                        <div className="space-y-1">
                          {c.itens.sort((a,b) => b.valor - a.valor).map((item, j) => (
                            <div key={j} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-600 font-mono">#{item.lote}</span>
                                <span className="text-gray-300 truncate max-w-[150px]">{item.artista}</span>
                              </div>
                              <span className="text-white font-mono">{formatCurrency(item.valor)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-gray-800 mt-2 pt-2 flex justify-between text-xs">
                          <span className="text-gray-500">Total ({c.lotes} lotes)</span>
                          <span className="font-semibold" style={{ color: GOLD }}>{formatCurrency(c.total)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Custos por categoria */}
      <div style={{ background: CARD_BG, border: `1px solid ${BORDER}` }} className="rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wide">Custos por Categoria</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
          {/* Pie chart */}
          <div className="flex justify-center">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={custosPorCategoria}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {custosPorCategoria.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={CATEGORY_COLORS[entry.name] || '#888'}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 8 }}
                  formatter={v => [formatCurrency(v), 'Total']}
                  labelStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Breakdown list */}
          <div className="space-y-3">
            {custosPorCategoria.map((cat, i) => {
              const pct = ((cat.value / totalCustos) * 100).toFixed(1)
              const color = CATEGORY_COLORS[cat.name] || '#888'
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white">{cat.name}</span>
                      <span className="text-sm font-semibold text-white">{formatCurrency(cat.value)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-800 rounded-full mt-1 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <span className="text-xs text-gray-500">{pct}% do total</span>
                  </div>
                </div>
              )
            })}
            <div className="pt-2 border-t border-gray-800 flex justify-between">
              <span className="text-xs text-gray-400">Total Custos</span>
              <span className="text-sm font-bold text-red-400">{formatCurrency(totalCustos)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
