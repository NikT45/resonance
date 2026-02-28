import Link from "next/link";
import Image from "next/image";

const FEATURES = [
  {
    title: "Multi-voice dialogue",
    copy: "Automatically separate narrator and characters so scenes are easy to follow.",
  },
  {
    title: "Emotion control",
    copy: "Make it calmer, brighter, or more cinematic with one simple slider.",
  },
  {
    title: "SFX and ambience",
    copy: "Add rain, forest, classroom, or quiet room tone without overwhelming voices.",
  },
  {
    title: "Shareable audiobooks",
    copy: "Send private listening links to family, study groups, or classmates.",
  },
  {
    title: "Friendly defaults",
    copy: "Balanced voice levels and gentle pacing are on by default.",
  },
  {
    title: "Safe libraries",
    copy: "Control who can listen with privacy-first sharing settings.",
  },
];

export default function Home() {
  return (
    <div className="res-page">
      <header className="site-header">
        <div className="container header-shell">
          <Link className="brand" href="/" aria-label="Resonance home">
            <Image
              src="/resonance-logo-book-transparent.png"
              alt="Resonance"
              className="brand-logo"
              width={220}
              height={80}
              priority
            />
          </Link>

          <nav className="main-nav" aria-label="Primary">
            <a href="#product">Product</a>
            <a href="#demo">Demo</a>
            <a href="#pricing">Pricing</a>
            <a href="#docs">Docs</a>
            <a href="#blog">Blog</a>
          </nav>

          <div className="header-actions">
            <a className="btn btn-secondary" href="#demo">
              See demo
            </a>
            <Link className="btn btn-primary" href="/upload">
              Upload script
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="section hero">
          <div className="container">
            <article className="hero-shell">
              <p className="eyebrow">Family-friendly audiobook magic</p>
              <h1>Write your script. Experience your story.</h1>
              <p className="hero-lead">
                Turn scripts into listening experiences with warm voices, calm ambience, and one clean generation
                flow.
              </p>
              <div className="hero-actions">
                <Link className="btn btn-primary" href="/upload">
                  Upload script
                </Link>
                <a className="btn btn-ghost" href="#product">
                  Explore features
                </a>
              </div>

              <div className="story-grid" aria-label="Simple workflow">
                <article className="story-card">
                  <p className="step-number">01</p>
                  <h2>Upload PDF</h2>
                  <p>Drop in a script file or paste your text in seconds.</p>
                </article>
                <article className="story-card">
                  <p className="step-number">02</p>
                  <h2>Set the tone</h2>
                  <p>Shape pacing, mood, and voice emotion in one place.</p>
                </article>
                <article className="story-card">
                  <p className="step-number">03</p>
                  <h2>Generate audio</h2>
                  <p>Create a playable story preview with voices and ambience.</p>
                </article>
              </div>
            </article>
          </div>
        </section>

        <section className="section" id="product">
          <div className="container">
            <div className="section-head">
              <p className="eyebrow">What you can make</p>
              <h2>Bring every scene to life, softly.</h2>
            </div>

            <div className="feature-grid">
              {FEATURES.map((feature) => (
                <article className="feature-card" key={feature.title}>
                  <h3>{feature.title}</h3>
                  <p>{feature.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="demo">
          <div className="container">
            <article className="mini-panel upload-bridge">
              <div>
                <p className="eyebrow">Connected flow</p>
                <h2>Upload button now links directly to your generator page.</h2>
                <p>
                  The upload screen has no chat UI. It now contains only PDF/text input and one generate button,
                  matching your branding guide.
                </p>
              </div>
              <Link className="btn btn-primary" href="/upload">
                Open Upload Studio
              </Link>
            </article>
          </div>
        </section>

        <section className="section" id="pricing">
          <div className="container">
            <div className="section-head">
              <p className="eyebrow">Plans</p>
              <h2>Simple pricing for families and teams.</h2>
            </div>
          </div>
        </section>

        <section className="section" id="docs">
          <div className="container">
            <article className="mini-panel">
              <h2>Docs that feel human.</h2>
              <p>Setup guides are written in plain language with examples for writers, students, and families.</p>
              <a className="text-link" href="#">
                Open documentation
              </a>
            </article>
          </div>
        </section>

        <section className="section" id="blog">
          <div className="container">
            <article className="mini-panel">
              <h2>Stories from the community.</h2>
              <p>See how creators are turning written pages into memorable listening experiences.</p>
              <a className="text-link" href="#">
                Read the blog
              </a>
            </article>
          </div>
        </section>
      </main>

      <footer className="site-footer section">
        <div className="container footer-shell">
          <div>
            <p className="brand-name">Resonance</p>
            <p>Private by default. Family-friendly voice settings. Safe sharing controls.</p>
          </div>
          <div className="footer-links">
            <a href="#product">Product</a>
            <a href="#demo">Demo</a>
            <a href="#pricing">Pricing</a>
            <a href="#docs">Docs</a>
            <a href="#blog">Blog</a>
          </div>
          <p className="copyright">© {new Date().getFullYear()} Resonance</p>
        </div>
      </footer>
    </div>
  );
}
