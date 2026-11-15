import type {RiderTab} from '../types/rider';

interface BottomNavProps {
  activeTab: RiderTab;
  onSelectTab: (tab: RiderTab) => void;
}

export function BottomNav({activeTab, onSelectTab}: BottomNavProps) {
  return (
    <div className="bottom-nav-wrap">
      <nav className="bottom-nav" aria-label="Primary Navigation">
        <button
          type="button"
          className={`nav-btn ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => onSelectTab('active')}
        >
          <i className="fa-solid fa-location-arrow" />
          <span>Trips</span>
        </button>
        <button
          type="button"
          className={`nav-btn ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => onSelectTab('map')}
        >
          <i className="fa-solid fa-map-location-dot" />
          <span>Map</span>
        </button>
        <button
          type="button"
          className={`nav-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => onSelectTab('history')}
        >
          <i className="fa-solid fa-clock-rotate-left" />
          <span>History</span>
        </button>
        <button
          type="button"
          className={`nav-btn ${activeTab === 'earnings' ? 'active' : ''}`}
          onClick={() => onSelectTab('earnings')}
        >
          <i className="fa-solid fa-wallet" />
          <span>Earnings</span>
        </button>
        <button
          type="button"
          className={`nav-btn ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => onSelectTab('profile')}
        >
          <i className="fa-solid fa-user-shield" />
          <span>Profile</span>
        </button>
      </nav>
    </div>
  );
}
