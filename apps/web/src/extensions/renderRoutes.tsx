import { Route } from 'react-router-dom';
import type { ExtensionRoute } from './types';

/** Turn ExtensionRoute entries into <Route> elements for use inside <Routes>. */
export function renderRoutes(routes: ExtensionRoute[]) {
  return routes.map((route, i) =>
    route.index ? (
      <Route key={`index-${i}`} index element={route.element} />
    ) : (
      <Route key={route.path ?? i} path={route.path} element={route.element}>
        {route.children && renderRoutes(route.children)}
      </Route>
    ),
  );
}
