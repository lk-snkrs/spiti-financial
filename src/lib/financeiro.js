// Calcula comissão do comprador (tabela progressiva tiered)
// 10% até R$100k, 7.5% de R$100k a R$200k, 5% acima de R$200k
export function calcularComissaoComprador(valorArremate) {
  if (valorArremate <= 0) return 0
  let comissao = 0
  if (valorArremate <= 100000) {
    comissao = valorArremate * 0.10
  } else if (valorArremate <= 200000) {
    comissao = 100000 * 0.10 + (valorArremate - 100000) * 0.075
  } else {
    comissao = 100000 * 0.10 + 100000 * 0.075 + (valorArremate - 200000) * 0.05
  }
  return comissao
}

export function calcularTotalComprador(valorArremate) {
  return valorArremate + calcularComissaoComprador(valorArremate)
}

export function formatCurrency(value) {
  if (!value && value !== 0) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

export function getStatusColor(status) {
  switch (status) {
    case 'pago': return 'bg-green-900 text-green-300'
    case 'parcial': return 'bg-yellow-900 text-yellow-300'
    case 'pendente': return 'bg-red-900 text-red-300'
    default: return 'bg-gray-800 text-gray-300'
  }
}
