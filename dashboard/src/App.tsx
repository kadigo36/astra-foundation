const spaces = [
  { name: "Escola", detail: "Aprendizagem e tarefas escolares" },
  { name: "Programação", detail: "Desenvolvimento e projetos técnicos" },
  { name: "Negócios", detail: "Clientes, operações e oportunidades" },
  { name: "Projetos pessoais", detail: "Objetivos e iniciativas pessoais" },
];

export default function App() {
  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/"><span className="brand-mark">A</span><span>ASTRA</span></a>
        <span className="status"><i /> Foundation v0.1 · modo de desenvolvimento</span>
      </header>
      <section className="hero">
        <p className="eyebrow">PERSONAL INTELLIGENCE SYSTEM</p>
        <h1>O teu espaço.<br /><span>A tua próxima evolução.</span></h1>
        <p className="intro">Uma fundação para um assistente estratégico, proativo e seguro. A ASTRA está a ser construída por fases.</p>
      </section>
      <section className="section">
        <div className="section-heading">
          <div><p className="eyebrow">WORKSPACES</p><h2>Espaços de trabalho</h2></div>
          <span className="counter">04 espaços planeados</span>
        </div>
        <div className="space-grid">
          {spaces.map((space, index) => <article className="space-card" key={space.name}>
            <span className="space-number">0{index + 1}</span><h3>{space.name}</h3>
            <p>{space.detail}</p><span className="coming-soon">A preparar</span>
          </article>)}
        </div>
      </section>
      <section className="notice">
        <div className="notice-icon">✳</div>
        <div><h2>Fundação em construção</h2><p>Autenticação, memória, integrações Google e agentes serão ativados gradualmente. Nenhuma ação externa está ativa nesta versão.</p></div>
      </section>
      <footer>ASTRA FOUNDATION <span>Construída com segurança desde a base.</span></footer>
    </main>
  );
}
