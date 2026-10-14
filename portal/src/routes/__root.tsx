import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Outlet, Link, createRootRouteWithContext } from '@tanstack/react-router';
export const Route = createRootRouteWithContext<{queryClient:QueryClient}>()({
  component: Root,
  notFoundComponent:()=> <main className="main-content"><h1>Страница не найдена</h1><Link to="/">На главную</Link></main>,
  errorComponent:({reset})=> <main className="main-content"><h1>Не удалось открыть страницу</h1><button onClick={reset}>Повторить</button></main>
});
function Root(){const {queryClient}=Route.useRouteContext();return <QueryClientProvider client={queryClient}><Outlet/></QueryClientProvider>}
