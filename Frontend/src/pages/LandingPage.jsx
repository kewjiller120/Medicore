import { Link } from 'react-router-dom';

const SERVICES = [
  {
    title: 'Find the right doctor',
    description: 'Browse specialists by department and see who is on staff before you decide who to see.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3v6a3 3 0 0 0 6 0V3" />
        <path d="M9 12v2a5 5 0 0 0 10 0v-3" />
        <circle cx="19" cy="8" r="2" />
      </svg>
    ),
  },
  {
    title: 'Book & manage appointments',
    description: 'Pick a doctor and a time that works for you, and cancel in a couple of taps if your plans change.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="5" width="17" height="15" rx="2" />
        <path d="M3.5 9.5h17" />
        <path d="M8 3v4M16 3v4" />
        <path d="M8.5 13.5l1.8 1.8 3.7-3.7" />
      </svg>
    ),
  },
  {
    title: 'Request an ambulance',
    description: 'Send your pickup and drop-off locations straight to our dispatch desk when every minute counts.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6z" />
        <path d="M12 8.5v5M9.5 11h5" />
      </svg>
    ),
  },
  {
    title: 'Pay your bills',
    description: 'See exactly what you owe on every visit and settle it online - no queueing at the billing counter.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </svg>
    ),
  },
];

const TRUST_POINTS = [
  {
    title: 'Round-the-clock emergency care',
    description: 'Our emergency department and ambulance dispatch are staffed and ready, day or night.',
  },
  {
    title: 'Specialists across key departments',
    description: 'From cardiology and neurology to orthopedics and general medicine - find the right doctor for you.',
  },
  {
    title: 'Clear, itemized billing',
    description: 'See exactly what you owe after every visit, and pay online or at the counter - whichever is easier.',
  },
];

export default function LandingPage() {
  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-brand">
            Medi<span>Core</span>
          </div>
          <div className="landing-nav-actions">
            <Link to="/login" className="btn-ghost">
              Log in
            </Link>
            <Link to="/register" className="btn btn-primary">
              Create account
            </Link>
          </div>
        </div>
      </nav>

      <header className="landing-hero">
        <div className="landing-hero-inner">
          <h1>Care that starts before you arrive.</h1>
          <p>
            MediCore brings your doctors, appointments, ambulance requests, and hospital bills into one place - so
            you can manage your care from home, and walk in only when it's time to be seen.
          </p>
          <div className="landing-hero-actions">
            <Link to="/register" className="btn btn-primary">
              Create a patient account
            </Link>
            <Link to="/login" className="btn btn-outline">
              Log in
            </Link>
          </div>
        </div>
      </header>

      <section className="landing-section">
        <div className="landing-section-head">
          <h2>What you can do, online</h2>
          <p>No queueing required for the everyday parts of getting care.</p>
        </div>
        <div className="landing-services">
          {SERVICES.map((service) => (
            <div className="landing-service-row" key={service.title}>
              <div className="landing-service-icon">{service.icon}</div>
              <div className="landing-service-text">
                <h3>{service.title}</h3>
                <p>{service.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="landing-trust">
        <div className="landing-trust-grid">
          {TRUST_POINTS.map((point) => (
            <div className="landing-trust-item" key={point.title}>
              <h3>{point.title}</h3>
              <p>{point.description}</p>
            </div>
          ))}
        </div>
      </div>

      <section className="landing-cta">
        <h2>Ready to get started?</h2>
        <p>Create your patient account in a couple of minutes.</p>
        <Link to="/register" className="btn btn-primary">
          Create a patient account
        </Link>
        <p className="landing-cta-note">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </section>

      <footer className="landing-footer">
        <div>MediCore Hospital Management System</div>
        <div>Doctors and staff: your administrator can set up an account for you.</div>
      </footer>
    </div>
  );
}
