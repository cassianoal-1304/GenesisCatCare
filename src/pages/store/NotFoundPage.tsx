import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/ui/Feedback'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'

export default function NotFoundPage({ title = 'Página não encontrada', message = 'O endereço acessado não existe ou foi removido.' }: { title?: string; message?: string }) {
  useDocumentTitle(title)
  return (
    <EmptyState title={title} action={<Link to="/catalogo" className="btn-primary">Ver catálogo</Link>}>
      {message}
    </EmptyState>
  )
}
