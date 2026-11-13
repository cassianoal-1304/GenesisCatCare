import type { MovementReason, OrderStatus } from '../../types/db'

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: 'amber' | 'blue' | 'green' | 'gray' | 'red' }> = {
  pending: { label: 'Aguardando confirmação', tone: 'amber' },
  confirmed: { label: 'Confirmado', tone: 'blue' },
  preparing: { label: 'Em preparação', tone: 'blue' },
  completed: { label: 'Finalizado', tone: 'green' },
  canceled: { label: 'Cancelado', tone: 'red' },
}

export const MOVEMENT_REASON: Record<MovementReason, string> = {
  initial: 'Estoque inicial',
  stock_in: 'Entrada',
  stock_out: 'Retirada',
  manual_sale: 'Venda registrada',
  manual_adjust: 'Ajuste manual',
  order_confirmed: 'Baixa de pedido',
  order_reversed: 'Estorno de pedido',
}
