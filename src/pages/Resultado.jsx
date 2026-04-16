import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatCurrency, calcularComissaoComprador } from '../lib/financeiro'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'

const LEILAO_ID = 'spiti9'

export default function Resultado() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('resumo')

  useEffect(() => {
    async function load() {
      try {
        const [
          { data: vendas, error: eVendas },
          { data: custos, error: eCustos },
          { data: lotesData, error: eLotes },
        ] = await Promise.all([
          supabase
            .from('spiti_vendas')
            .select('*')
            .eq('leilao_id', LEILAO_ID),
          supabase
            .from('spiti_custos')
            .select('*')
            .eq('leilao_id', LEILAO_ID),
          supabase
            .from('spiti_lotes_financeiro')
            .select('lote, comissao_consignante_pct, artista')
            .eq('leilao_id', LEILAO_ID),
        ])

        if (eVendas) throw eVendas
        if (eCustos) throw eCustos
        if (eLotes) throw eLotes

        const vendasArr = vendas || []
        const custosArr = custos || []
        const lotesMap = Object.fromEntries((lotesData || []).map(l => [l.lote, l]))

        // ── Receita ──────────────────────────────────────────────
        const totalArremate = vendasArr.reduce((s, v) => s + (v.valor_arremate || 0), 0)

        const comissaoCompradores = vendasArr.reduce((s, v) => {
          return s + calcularComissaoComprador(v.valor_arremate || 0)
        }, 0)

        const comissaoConsignantes = vendasArr.reduce((s, v) => {
          const loteInfo = lotesMap[v.lote]
          const pct = loteInfo?.comissao_consignante_pct ?? 15
          return s + (v.valor_arremate || 0) * (pct / 100)
        }, 0)

        const receitaTotal = comissaoCompradores + comissaoConsignantes

        // ── Despesas ─────────────────────────────────────────────
        const totalCustos = custosArr.reduce((s, c) => s + (c.valor || 0), 0)

        // ── Resultado ─────────────────────────────────────────────
        const resultado = receitaTotal - totalCustos
        const margemPct = receitaTotal > 0 ? (resultado / receitaTotal) * 100 : 0

        // Custos por categoria
        const custosByCat = custosArr.reduce((acc, c) => {
          const cat = c.categoria || 'Outros'
          acc[cat] = (acc[cat] || 0) + (c.valor || 0)
          return acc
        }, {})

        // Detalhe por venda
        const vendasDetalhadas = vendasArr.map(v => {
          const loteInfo = lotesMap[v.lote]
          const pct = loteInfo?.comissao_consignante_pct ?? 15
          const comissaoC = calcularComissaoComprador(v.valor_arremate || 0)
          const comissaoK = (v.valor_arremate || 0) * (pct / 100)
          return {
            ...v,
            lote: v.lote || '—',
            artista: loteInfo?.artista || v.artista || '—',
            comissao_comprador: comissaoC,
            comissao_consignante_valor: comissaoK,
            comissao_consignante_pct: pct,
            receita_lote: comissaoC + comissaoK,
          }
        }).sort((a, b) => b.receita_lote - a.receita_lote)

        setData({
          totalArremate,
          comissaoCompradores,
          comissaoConsignantes,
          receitaTotal,
          totalCustos,
          resultado,
          margemPct,
          custosByCat,
          custos: custosArr,
          vendas: vendasDetalhadas,
          lotesSold: vendasArr.length,
        })
      } catch (err) {
        console.error(err)
        setError(err.message || 'Erro ao carregar dados')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-400 text-sm animate-pulse">Carregando resultado...</div>
    </div>
  )

  if (error) return (
    <div className="bg-red-900/20 border border-red-800 rounded-xl p-6 text-red-400 text-sm">
      Erro: {error}
    </div>
  )

  if (!data) return null

  const pieReceita = [
    { name: 'Comissão Compradores', value: data.comissaoCompradores, color: '#C9A84C' },
    { name: 'Comissão Consignantes', value: data.comissaoConsignantes, color: '#E5C97A' },
  ]

  const custoPieData = Object.entries(data.custosByCat).map(([k, v], i) => ({
    name: k,
    value: v,
    color: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'][i % 7],
  }))

  const barData = [
    { name: 'Receita', value: data.receitaTotal, fill: '#C9A84C' },
    { name: 'Custos', value: data.totalCustos, fill: '#ef4444' },
    { name: 'Resultado', value: data.resultado, fill: data.resultado >= 0 ? '#22c55e' : '#ef4444' },
  ]

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Resultado — SPITI 9</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Consolidado financeiro · {data.lotesSold} lotes vendidos
          </p>
        </div>
        <div className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
          data.resultado >= 0
            ? 'bg-green-900/30 border-green-700 text-green-400'
            : 'bg-red-900/30 border-red-700 text-red-400'
        }`}>
          {data.resultado >= 0 ? '✓ Superávit' : '✗ Déficit'}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Total Arrematado"
          value={formatCurrency(data.totalArremate)}
          sub={`${data.lotesSold} lotes`}
          color="text-white"
          icon="🏷️"
        />
        <KPICard
          label="Receita Spiti"
          value={formatCurrency(data.receitaTotal)}
          sub={`Margem ${data.margemPct.toFixed(1)}%`}
          color="text-yellow-400"
          icon="💰"
        />
        <KPICard
          label="Despesas"
          value={formatCurrency(data.totalCustos)}
          sub={`${Object.keys(data.custosByCat).length} categorias`}
          color="text-red-400"
          icon="📋"
        />
        <KPICard
          label="Resultado Líquido"
          value={formatCurrency(data.resultado)}
          sub={`${data.margemPct.toFixed(1)}% da receita`}
          color={data.resultado >= 0 ? 'text-green-400' : 'text-red-400'}
          icon={data.resultado >= 0 ? '📈' : '📉'}
          highlight
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-0">
        {[
          { id: 'resumo', label: 'Resumo' },
          { id: 'receita', label: 'Receita Detalhada' },
          { id: 'custos', label: 'Custos' },
          { id: 'lotes', label: 'Por Lote' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === t.id
                ? 'text-yellow-400 border-b-2 border-yellow-400 -mb-px bg-yellow-400/5'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Resumo */}
      {activeTab === 'resumo' && (
        <div className="space-y-6">
          {/* DRE */}
          <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-300 mb-5 flex items-center gap-2">
              <span className="text-yellow-500">▸</span> Demonstrativo de Resultado (DRE)
            </h2>
            <div className="space-y-1">
              <DRERow indent={0} label="Valor Total Arrematado" value={data.totalArremate} note={`${data.lotesSold} lotes`} />
              <div className="h-px bg-[#2a2a2a] my-3" />
              <DRERow indent={1} label="(+) Comissão dos Compradores" value={data.comissaoCompradores} color="text-green-400" />
              <DRERow indent={1} label="(+) Comissão dos Consignantes" value={data.comissaoConsignantes} color="text-green-400" />
              <DRERow indent={0} label="= Receita Total (Comissões Spiti)" value={data.receitaTotal} color="text-yellow-400" bold />
              <div className="h-px bg-[#2a2a2a] my-3" />
              <DRERow indent={1} label="(-) Custos Operacionais" value={-data.totalCustos} color="text-red-400" />
              <div className="h-px bg-[#2a2a2a] my-3" />
              <DRERow indent={0} label="= RESULTADO LÍQUIDO" value={data.resultado} color={data.resultado >= 0 ? 'text-green-400' : 'text-red-400'} bold big />
            </div>
          </div>

          {/* Bar chart */}
          <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
              <span className="text-yellow-500">▸</span> Visão Geral
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} barSize={56}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  formatter={v => [formatCurrency(v), '']}
                  contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, fontSize: 12 }}
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tab: Receita Detalhada */}
      {activeTab === 'receita' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Breakdown cards */}
            <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <span className="text-yellow-500">▸</span> Breakdown de Receita
              </h2>
              <div className="space-y-3">
                <div className="bg-[#1a1a1a] rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-xs text-gray-400">Comissão dos Compradores</p>
                      <p className="text-xs text-gray-600 mt-0.5">Tiered: 10% ≤ R$100k · 7,5% R$100-200k · 5% &gt; R$200k</p>
                    </div>
                    <span className="text-yellow-400 font-semibold text-sm">{formatCurrency(data.comissaoCompradores)}</span>
                  </div>
                  <div className="bg-[#111] rounded h-1.5 overflow-hidden">
                    <div
                      className="bg-yellow-500 h-full rounded"
                      style={{ width: `${data.receitaTotal > 0 ? (data.comissaoCompradores / data.receitaTotal * 100) : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-1 text-right">
                    {data.receitaTotal > 0 ? (data.comissaoCompradores / data.receitaTotal * 100).toFixed(1) : 0}% da receita
                  </p>
                </div>

                <div className="bg-[#1a1a1a] rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-xs text-gray-400">Comissão dos Consignantes</p>
                      <p className="text-xs text-gray-600 mt-0.5">% variável por consignante</p>
                    </div>
                    <span className="text-yellow-300 font-semibold text-sm">{formatCurrency(data.comissaoConsignantes)}</span>
                  </div>
                  <div className="bg-[#111] rounded h-1.5 overflow-hidden">
                    <div
                      className="bg-yellow-300 h-full rounded"
                      style={{ width: `${data.receitaTotal > 0 ? (data.comissaoConsignantes / data.receitaTotal * 100) : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-1 text-right">
                    {data.receitaTotal > 0 ? (data.comissaoConsignantes / data.receitaTotal * 100).toFixed(1) : 0}% da receita
                  </p>
                </div>

                <div className="border-t border-[#2a2a2a] pt-3 flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-200">Total Receita</span>
                  <span className="text-yellow-400 font-bold text-base">{formatCurrency(data.receitaTotal)}</span>
                </div>
              </div>
            </div>

            {/* Pie chart */}
            <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-6">
              <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                <span className="text-yellow-500">▸</span> Composição da Receita
              </h2>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieReceita}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieReceita.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={v => [formatCurrency(v), '']}
                    contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend
                    formatter={(value) => <span style={{ color: '#9ca3af', fontSize: 12 }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Custos */}
      {activeTab === 'custos' && (
        <div className="space-y-6">
          {data.custos.length === 0 ? (
            <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-12 text-center">
              <p className="text-gray-500 text-sm">Nenhum custo registrado para este leilão</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Custos table */}
              <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-6">
                <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                  <span className="text-yellow-500">▸</span> Custos Operacionais
                </h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-[#2a2a2a]">
                      <th className="text-left pb-2 font-medium">Categoria</th>
                      <th className="text-left pb-2 font-medium">Descrição</th>
                      <th className="text-right pb-2 font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.custos.map((c, i) => (
                      <tr key={i} className="border-b border-[#1a1a1a] hover:bg-white/[0.02]">
                        <td className="py-2.5 text-gray-400">
                          <span className="bg-[#1a1a1a] text-xs px-2 py-0.5 rounded">{c.categoria || '—'}</span>
                        </td>
                        <td className="py-2.5 text-gray-300 text-xs">{c.descricao || '—'}</td>
                        <td className="py-2.5 text-right text-red-400 font-mono">{formatCurrency(c.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[#3a3a3a]">
                      <td colSpan={2} className="pt-3 text-sm font-semibold text-gray-200">Total</td>
                      <td className="pt-3 text-right text-red-400 font-bold font-mono">{formatCurrency(data.totalCustos)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Pie custos */}
              {custoPieData.length > 0 && (
                <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl p-6">
                  <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
                    <span className="text-yellow-500">▸</span> Por Categoria
                  </h2>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={custoPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {custoPieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={v => [formatCurrency(v), '']}
                        contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, fontSize: 12 }}
                      />
                      <Legend
                        formatter={(value) => <span style={{ color: '#9ca3af', fontSize: 12 }}>{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab: Por Lote */}
      {activeTab === 'lotes' && (
        <div className="bg-[#111111] border border-[#2a2a2a] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#2a2a2a]">
            <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <span className="text-yellow-500">▸</span> Receita por Lote
              <span className="text-xs text-gray-500 font-normal ml-2">ordenado por maior receita</span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 bg-[#0d0d0d]">
                  <th className="text-left px-4 py-3 font-medium">Lote</th>
                  <th className="text-left px-4 py-3 font-medium">Comprador</th>
                  <th className="text-right px-4 py-3 font-medium">Arremate</th>
                  <th className="text-right px-4 py-3 font-medium">Comissão Comp.</th>
                  <th className="text-right px-4 py-3 font-medium">Comissão Cons.</th>
                  <th className="text-right px-4 py-3 font-medium">Pct Cons.</th>
                  <th className="text-right px-4 py-3 font-medium">Receita Lote</th>
                </tr>
              </thead>
              <tbody>
                {data.vendas.map((v, i) => (
                  <tr key={v.id || i} className="border-t border-[#1a1a1a] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-yellow-500 font-mono font-medium">{v.lote}</td>
                    <td className="px-4 py-3 text-gray-300 text-xs max-w-[160px] truncate">{v.comprador_nome || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-200 font-mono">{formatCurrency(v.valor_arremate)}</td>
                    <td className="px-4 py-3 text-right text-yellow-400 font-mono">{formatCurrency(v.comissao_comprador)}</td>
                    <td className="px-4 py-3 text-right text-yellow-300 font-mono">{formatCurrency(v.comissao_consignante_valor)}</td>
                    <td className="px-4 py-3 text-right text-gray-400 text-xs">{v.comissao_consignante_pct}%</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-400 font-mono">{formatCurrency(v.receita_lote)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#3a3a3a] bg-[#0d0d0d]">
                  <td colSpan={2} className="px-4 py-3 text-sm font-bold text-gray-200">
                    Total ({data.lotesSold} lotes)
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-white font-mono">{formatCurrency(data.totalArremate)}</td>
                  <td className="px-4 py-3 text-right font-bold text-yellow-400 font-mono">{formatCurrency(data.comissaoCompradores)}</td>
                  <td className="px-4 py-3 text-right font-bold text-yellow-300 font-mono">{formatCurrency(data.comissaoConsignantes)}</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right font-bold text-green-400 font-mono">{formatCurrency(data.receitaTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────

function KPICard({ label, value, sub, color = 'text-white', icon, highlight }) {
  return (
    <div className={`bg-[#111111] border rounded-xl p-5 ${highlight ? 'border-yellow-700/40' : 'border-[#2a2a2a]'}`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-gray-400 text-xs font-medium leading-tight">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className={`text-xl font-bold font-mono ${color} mb-1`}>{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </div>
  )
}

function DRERow({ label, value, color = 'text-gray-300', bold, big, indent = 0, note }) {
  return (
    <div className={`flex justify-between items-center py-1.5 ${indent > 0 ? 'pl-4' : ''}`}>
      <div className="flex items-center gap-2">
        {indent > 0 && <span className="text-gray-700 text-xs">↳</span>}
        <span className={`text-sm ${bold ? 'font-semibold' : 'font-normal'} ${indent > 0 ? 'text-gray-400' : 'text-gray-200'}`}>
          {label}
        </span>
        {note && <span className="text-xs text-gray-600">({note})</span>}
      </div>
      <span className={`font-mono ${big ? 'text-xl font-bold' : 'text-sm'} ${bold ? 'font-semibold' : ''} ${color}`}>
        {formatCurrency(value)}
      </span>
    </div>
  )
}
