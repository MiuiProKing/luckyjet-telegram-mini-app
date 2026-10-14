import { createFileRoute } from '@tanstack/react-router';
import { AppShell,StatusStrip,PageTitle } from '@/components/app-shell';
import { Catalogue } from '@/components/catalogue';
import { pageHead } from '@/lib/metadata';
export const Route=createFileRoute('/catalogue')({head:()=>pageHead('Каталог версий','51 оригинальная версия Lucky Jet, Rocket Queen и Aviator. Поиск и переход к сохранённым инструментам.'),component:Page});
function Page(){return <AppShell><StatusStrip/><PageTitle eyebrow="51 ВЕРСИЯ / 3 ИГРЫ" title="Ваша коллекция." description="Классика, экспериментальные модели и расширенная аналитика."/><Catalogue/></AppShell>}
