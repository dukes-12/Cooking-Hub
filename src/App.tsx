import { Discover } from './screens/Discover';
import { Fridge } from './screens/Fridge';
import { Import } from './screens/Import';
import { Menu } from './screens/Menu';
import { Onboarding } from './screens/Onboarding';
import { Profile } from './screens/Profile';
import { RecipeDetail } from './screens/RecipeDetail';
import { Search } from './screens/Search';
import { Shopping, ShopMode } from './screens/Shopping';
import { go, useRoute } from './router';
import { useLexiconReady } from './lib/lexicon';
import { useApp } from './state';

const TABS = [
  { id: 'discover', label: 'Découvrir', icon: '✨' },
  { id: 'search', label: 'Recherche', icon: '🔍' },
  { id: 'menu', label: 'Recettes', icon: '📖' },
  { id: 'fridge', label: 'Frigo', icon: '🧊' },
  { id: 'shopping', label: 'Courses', icon: '🛒' },
];

export function App() {
  const { state } = useApp();
  useLexiconReady(); // réaffiche les écrans quand le dictionnaire multilingue est chargé
  const [page, param] = useRoute();

  if (!state.onboarded) return <div className="app"><Onboarding /></div>;

  let screen;
  switch (page) {
    case 'search': screen = <Search />; break;
    case 'menu': screen = <Menu />; break;
    case 'fridge': screen = <Fridge />; break;
    case 'shopping': screen = <Shopping />; break;
    case 'shop-mode': screen = <ShopMode />; break;
    case 'recipe': screen = <RecipeDetail key={param} id={param} />; break;
    case 'profile': screen = <Profile />; break;
    case 'import': screen = <Import />; break;
    default: screen = <Discover />;
  }
  const showTabs = !['recipe', 'shop-mode', 'import'].includes(page);
  const pendingShopping = state.shopping.filter((i) => !i.checked).length;

  return (
    <div className={`app ${showTabs ? 'with-tabs' : ''}`}>
      <main>{screen}</main>
      {showTabs && (
        <nav className="tabbar">
          {TABS.map((t) => (
            <button key={t.id} className={page === t.id || (t.id === 'discover' && page === 'profile') ? 'is-active' : ''} onClick={() => go('/' + t.id)}>
              <span className="tab-icon">{t.icon}{t.id === 'shopping' && pendingShopping > 0 && <i className="tab-badge">{pendingShopping}</i>}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
