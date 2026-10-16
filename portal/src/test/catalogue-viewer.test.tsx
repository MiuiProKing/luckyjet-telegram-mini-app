import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { Catalogue } from '@/components/catalogue';
import { LEGACY_BASE, versions } from '@/lib/versions';
import { Route } from '@/routes/viewer.$version';

const viewerParams = vi.hoisted(() => ({ version: '33' }));
type LinkProps = Omit<ComponentProps<'a'>, 'href'> & {
  to: string;
  params?: { version: string };
};

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, ...props }: LinkProps) => (
    <a href={params ? to.replace('$version', params.version) : to} {...props}>{children}</a>
  ),
  createFileRoute: () => (options: object) => ({ options, useParams: () => viewerParams }),
}));
vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  StatusStrip: () => null,
}));

beforeEach(() => { viewerParams.version = '33'; });
afterEach(cleanup);

function renderViewer() {
  const Viewer = Route.options.component;
  if (!Viewer) throw new Error('Viewer component is missing');
  return render(<Viewer />);
}

describe('Catalogue names and navigation', () => {
  it('finds both analyzer editions using normal Cyrillic', () => {
    render(<Catalogue />);
    fireEvent.change(screen.getByLabelText('Поиск версии'), { target: { value: 'анализатор' } });

    expect(screen.getAllByRole('heading', { level: 3 }).map(node => node.textContent)).toEqual([
      'Анализатор · обновлённый',
      'Анализатор',
    ]);
    expect(screen.getAllByRole('link').map(node => node.getAttribute('href'))).toEqual([
      '/viewer/9',
      '/viewer/10',
    ]);
  });

  it.each([
    ['beta-v2/index.html', 'Beta V2 · расширенная'],
    ['gamehub-luckyjet-montante.htm', 'Монтанте'],
    ['ru-ukraine/ema20-50-multimodel-v3.html', 'EMA · мультимодель V3'],
  ])('keeps the recovered display name for %s', (path, name) => {
    expect(versions.find(version => version.path === path)?.name).toBe(name);
  });
});

describe('Original application viewer', () => {
  it('opens Classic with its adapter hash and permits original downloads and game windows', () => {
    renderViewer();
    const frame = screen.getByTitle('Оригинальный Lucky Jet Classic');
    const classicUrl = `${LEGACY_BASE}index.html#luckyjet`;

    expect(frame.getAttribute('src')).toBe(classicUrl);
    expect(frame.getAttribute('sandbox')?.split(/\s+/)).toEqual(expect.arrayContaining([
      'allow-scripts',
      'allow-same-origin',
      'allow-forms',
      'allow-modals',
      'allow-downloads',
      'allow-popups',
      'allow-popups-to-escape-sandbox',
    ]));
    const originalLink = screen.getByRole('link', { name: 'Открыть оригинал в новой вкладке' });
    expect(originalLink.getAttribute('href')).toBe(classicUrl);
    expect(originalLink.getAttribute('rel')?.split(/\s+/)).toEqual(expect.arrayContaining([
      'noopener', 'noreferrer',
    ]));
  });

  it('offers catalogue navigation without embedding an unknown version', () => {
    viewerParams.version = 'missing';
    const { container } = renderViewer();

    expect(screen.getByText(/Версия не найдена/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Вернуться в каталог' }).getAttribute('href')).toBe('/catalogue');
    expect(container.querySelector('iframe')).toBeNull();
  });
});
