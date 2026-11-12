// Portuguese (European) copy of the two solution pages. Source: copy-en.ts.
// Rules for translators: scripts/seo/solution-landings/TRANSLATING.md.
import type { LangCopy } from './types'

export const copy: LangCopy = {
  ui: {
    home: 'IFC Viewer Online',
    sources: 'Fontes',
    readOn: 'lido a',
    preview: 'Pré-visualização',
    faqLabel: 'Perguntas frequentes',
    faqTitle: 'O que os compradores perguntam',
    related: 'Relacionado',
    pricing: 'Planos e preços',
    postReception: 'Rever os modelos IFC dos subempreiteiros',
    postClash: 'Deteção de colisões no navegador',
    postBatch: 'Validar muitos ficheiros IFC de uma vez',
  },
  pages: {
    contractors: {
      title: 'Receção de modelos IFC para construtoras e promotores',
      desc: 'Os subempreiteiros verificam o IFC face aos seus requisitos, grátis, antes de o enviar; só revê o que passa. Plano Reception em pré-visualização.',
      nav: 'Para construtoras',
      kicker: 'Para construtoras e promotores · Plano Reception · Pré-visualização',
      h1: ['Receba apenas modelos IFC que já cumprem', 'para construtoras e promotores que recebem modelos dos subempreiteiros'],
      lead: 'Publique os seus requisitos numa só ligação. Cada subempreiteiro verifica o modelo face a eles, gratuitamente, no navegador, e corrige-o antes de o enviar. Vê quem entregou, o que cumpre e porque é devolvido o resto, com um relatório pronto para o cliente.',
      cta: 'Fale connosco',
      cta2: 'Como funciona a revisão',
      note: 'Pré-visualização: o plano Reception está desenhado e é mostrado aqui com dados de exemplo. Ainda não está à venda e nada é guardado. Verificar um modelo é gratuito e funciona hoje.',
      hero: {
        alt: 'Resumo do Reception de um projeto residencial com dados de exemplo: ações de hoje, horas e euros poupados estimados e fornecedores por marco',
        cap: 'A obra num relance, com dados de exemplo: o que rever hoje, a poupança estimada com os seus pressupostos e cada fornecedor por marco. Interface em espanhol.',
      },
      sections: [
        {
          kind: 'text', label: 'O problema', h2: 'Os modelos maus são descobertos por quem os recebe',
          ps: [
            'Segundo a ISO 19650-2, rever e aceitar o modelo de informação é uma atividade da parte contratante: a construtora ou o promotor que o recebe. A orientação do UK BIM Framework descreve essa verificação como parte do fluxo do ambiente comum de dados.',
            'A Skanska UK afirma que os seus objetivos dependem "critically" (de forma crítica) de receber informação de qualidade da sua cadeia de fornecimento. Os BIM managers de construtoras descrevem dificuldades consideráveis em fazer circular a informação pela cadeia por e-mail e FTP.',
            'Na prática, um coordenador abre cada entrega, encontra as mesmas propriedades em falta e os mesmos nomes errados, escreve os motivos à mão e espera pela versão seguinte. O subempreiteiro só conhece as regras depois de ser rejeitado.',
          ],
          sources: ['ukbimPartC', 'skanska', 'cmTier2'],
        },
        {
          kind: 'flow', label: 'Como funciona', h2: 'Dos seus requisitos ao relatório para o cliente',
          sub: 'Todas as capturas abaixo são o design do Reception com dados de exemplo (projeto «Mirador del Turia», dez fornecedores). A interface está em espanhol.',
          steps: [
            { h: 'Publique os seus requisitos como ligação', p: 'Regras, IDS e pontuação mínima por estado ISO 19650. Os subempreiteiros recebem a versão aprovada; uma ligação antiga continua a funcionar.', alt: 'Biblioteca de regras com uma mudança de versão, o seu efeito no mesmo modelo e um botão para criar a ligação para os subempreiteiros', cap: 'O que muda entre versões de regras e a ligação que vai para os subempreiteiros.' },
            { h: 'Os subempreiteiros verificam grátis antes de enviar', p: 'Sem conta. Veem a pontuação, o que falha, os elementos envolvidos e o [guia de correção](fix) de cada regra, pelo que a maioria dos erros é corrigida antes de chegar até si.', alt: 'Página de fornecedor sem conta com uma pontuação de 84, um nome de ficheiro errado e a lista do que corrigir', cap: 'A página que um subempreiteiro vê: o que passa, o que falha e como mudar o nome do ficheiro.' },
            { h: 'Reveja uma fila, não uma caixa de entrada', p: 'As entregas chegam já verificadas, com o nome do ficheiro lido segundo a ISO 19650 e um antes e depois face à versão anterior. Os atalhos de teclado levam-no pela fila.', alt: 'Diálogo de revisão com quatro versões de uma entrega, o nome de ficheiro ISO 19650 separado em campos e a pontuação de requisitos', cap: 'Uma entrega: as suas versões, o nome do ficheiro campo a campo e os requisitos.' },
            { h: 'Devolva-o com motivos com que o fornecedor possa agir', p: 'Cada motivo aponta para os elementos em 3D e para como corrigi-los. Tudo fica registado com um hash encadeado e é exportado para CSV.', alt: 'Decisão de devolver uma entrega com os motivos falhados assinalados e os elementos listados', cap: 'Devolver um modelo: os motivos, os elementos e uma nota para o fornecedor.' },
            { h: 'Veja as colisões entre disciplinas ao longo do tempo', p: 'As colisões são calculadas no navegador, ordenadas por custo estimado, com a tendência entre execuções.', alt: 'Painel de colisões com a tendência entre execuções e as colisões ordenadas por custo estimado', cap: 'Colisões com a sua tendência e custo estimado (hotel federado de exemplo).' },
            { h: 'Mantenha o cliente informado sem ter de o escrever', p: 'Uma página de projeto com a última pontuação, as entregas aceites, as colisões resolvidas e o próximo marco. Na pré-visualização o envio é simulado.', alt: 'Página de projeto para o cliente com o Health Score do modelo, as colisões resolvidas e a cronologia', cap: 'O que o cliente vê ao abrir a ligação de atualização.' },
            { h: 'Envie o relatório semanal à direção de obra', p: 'Recebido, aprovado, em falta e o tempo poupado estimado, escrito para copiar ou descarregar.', alt: 'Relatório semanal de entregas para a direção de obra com um resumo por fornecedor', cap: 'O relatório semanal, gerado a partir das entregas.' },
          ],
        },
        {
          kind: 'table', label: 'Poupança estimada', h2: 'Cerca de 22 horas por mês de um coordenador, segundo os nossos pressupostos',
          sub: 'Uma estimativa, não uma medição. Troque os números pelos seus: o resumo do Reception permite editar cada pressuposto.',
          head: ['Tarefa', 'Pressuposto', 'Parte poupada (pressuposta)', 'Minutos por mês'],
          rows: [
            ['Rever entregas à mão', '40 entregas × 25 min', '80 %', '800'],
            ['Preparar a reunião de colisões', '4 reuniões × 90 min', '70 %', '252'],
            ['Escrever o relatório para o cliente', '8 relatórios × 45 min', '80 %', '288'],
            ['Total', '', '', '1.340 min ≈ 22 h'],
          ],
          after: [
            'A 45 € por hora, são cerca de 1.000 € por mês. O plano Reception está previsto a partir de 290 € por projeto por mês, pelo que, com estes pressupostos, paga cerca de três vezes o seu custo. Não se contam o retrabalho nem as penalizações evitadas.',
          ],
        },
        {
          kind: 'table', label: 'Comparação', h2: 'Ao lado de um ambiente comum de dados',
          sub: 'Cada coluna de fornecedor diz apenas o que a página desse fornecedor dizia no dia em que a lemos. Quando a página nada diz, a célula indica-o.',
          head: ['', 'Catenda Hub', 'Dalux Box', 'Autodesk Construction Cloud', 'IFC Viewer Online Reception (pré-visualização)'],
          rows: [
            ['Preço publicado', 'Por projeto, segundo o valor da obra: cerca de 400 € por mês para um projeto de 10 M€, cerca de 1.100 € para 50 M€; orçamento a pedido', 'Nenhum na página do produto; formulário de contacto', 'Nenhum; orçamento por pacote, com preços por utilizador, projeto e conta', 'Previsto: a partir de 290 € por projeto por mês com 15 fornecedores, ou 790 € ilimitado. Ainda não está à venda'],
            ['Os fornecedores precisam de licença', 'Não: "Your subs don\'t need a licence to log a defect" (os seus subempreiteiros não precisam de licença para registar um defeito)', 'Não indicado na página', 'Não indicado na página', 'Sem conta: verificam grátis no navegador'],
            ['Verificar modelos face a requisitos', 'Não indicado na página de preços', 'Sim: validar dados e geometria do modelo face aos requisitos do projeto', 'O pacote Model Management inclui preparação de modelos, coordenação e deteção de colisões', 'Regras e IDS 1.0 com uma pontuação por entrega. Verificar é gratuito hoje; a caixa de entrada está em pré-visualização'],
            ['Aprovação dos modelos recebidos', 'Não indicado na página de preços', 'Fluxos de aprovação e uma convenção de nomes de ficheiro obrigatória', 'Não indicado na página de preços', 'Aceitar ou devolver com motivos e elementos em 3D (pré-visualização)'],
          ],
          after: [
            'Não substitui o seu CDE. Fica antes dele: seja qual for o CDE que use, o modelo chega já verificado face aos seus requisitos, e o fornecedor conhecia-os antes de enviar.',
          ],
          sources: ['catenda', 'dalux', 'acc'],
        },
        {
          kind: 'cols', label: 'Grátis e pré-visualização', h2: 'O que funciona hoje e o que é pré-visualização',
          cols: [
            { h: 'Grátis, disponível hoje', items: ['Abrir e verificar qualquer IFC no navegador, sem carregar nada', 'Os seus ficheiros IDS 1.0 e 44 regras com Health Score', 'Importar e exportar BCF, comparar versões', 'Os [guias de correção](fix) de cada regra'] },
            { h: 'Plano Reception, em pré-visualização', items: ['Ligação de requisitos com versões por estado ISO 19650', 'Fila de entregas com aceitar ou devolver e motivos', 'Ficha de fornecedor e registo com hash encadeado', 'Página para o cliente e relatório semanal'] },
          ],
        },
      ],
      faq: [
        ['Posso usar o Reception hoje?', 'Ainda não. Está desenhado e é mostrado com dados de exemplo. Se recebe modelos de subempreiteiros, [fale connosco](pricing): procuramos alguns projetos-piloto. Verificar um modelo face aos seus requisitos é gratuito e funciona hoje no [visualizador](viewer).'],
        ['Os subempreiteiros pagam ou precisam de conta?', 'Não. Abrem a sua ligação e verificam o modelo gratuitamente no navegador. Paga quem recebe e gere as entregas.'],
        ['Substitui o Catenda, o Dalux ou o Autodesk Construction Cloud?', 'Não. Verifica o modelo antes de chegar ao seu CDE e funciona com qualquer CDE. Cada CDE tem o seu próprio fluxo; veja a comparação acima com a data em que lemos as suas páginas.'],
        ['O modelo é carregado para ser verificado?', 'Na verificação gratuita, não: corre no navegador do subempreiteiro. No Reception, a entrega que aceita é guardada para si na UE.'],
        ['Quanto vai custar?', 'Está previsto a partir de 290 € por projeto por mês com 15 fornecedores, ou 790 € para projetos ilimitados. Os preços podem mudar antes do lançamento; veja os [planos](pricing).'],
        ['De onde vem o valor da poupança?', 'Dos pressupostos da tabela acima: número de entregas, minutos por tarefa e a parte que cada tarefa poupa. São pressupostos, não medições, e pode alterá-los no resumo.'],
      ],
      faqSources: ['catenda', 'dalux', 'acc'],
      bottom: ['Recebe modelos de subempreiteiros?', 'Diga-nos quantos projetos e fornecedores tem. Estamos a escolher alguns projetos-piloto para o Reception.'],
    },
    engineering: {
      title: 'Coordenação BIM para gabinetes de engenharia — plano Team',
      desc: 'Entregue modelos que o cliente aceita à primeira: regras partilhadas, colisões, ocorrências com correção e controlo de publicação. Team em pré-visualização.',
      nav: 'Para gabinetes de engenharia',
      kicker: 'Para gabinetes de engenharia e ateliers · Plano Team · Pré-visualização',
      h1: ['Entregue modelos que o cliente aceita à primeira', 'para gabinetes de engenharia e ateliers que coordenam várias disciplinas'],
      lead: 'Um único conjunto de regras da empresa, colisões no navegador, ocorrências com a câmara e uma correção sugerida, e um controlo que impede a publicação de um modelo abaixo da sua pontuação mínima. O cliente vê o progresso sem que tenha de o escrever.',
      cta: 'Entrar na lista de espera do Team',
      cta2: 'Deteção de colisões no navegador',
      note: 'Pré-visualização: o plano Team está desenhado e é mostrado aqui com dados de exemplo. Ainda não está à venda e nada é guardado. Verificar um modelo com o seu IDS é gratuito e funciona hoje.',
      hero: {
        alt: 'Painel do Team com dados de exemplo: Health Score por projeto e a sua tendência, ocorrências abertas por pessoa e prazos em risco',
        cap: 'O painel da equipa, com dados de exemplo: saúde de cada projeto, carga por pessoa e prazos em risco. Interface em espanhol.',
      },
      sections: [
        {
          kind: 'text', label: 'O problema', h2: 'As rejeições vêm de detalhes que ninguém verificou',
          ps: [
            'Os clientes já enviam os seus próprios requisitos de informação, muitas vezes em IDS. Uma entrega a que falta um nome de propriedade ou uma classificação é devolvida, e corrigi-la custa mais do que teria custado verificá-la.',
            'Um consultor BIM descreve um problema de validação de dados IFC que custou semanas, causado por nomes de propriedades que não correspondiam ao exigido. A ISO 19650-2 faz da verificação antes de partilhar um passo da equipa de entrega, não do cliente.',
            'Num atelier as regras vivem na cabeça ou na folha de cálculo de uma pessoa, as colisões são revistas numa reunião e as ocorrências acabam em fios de e-mail sem a vista que os explica.',
          ],
          sources: ['bimCorner', 'ukbimPartC'],
        },
        {
          kind: 'flow', label: 'Como funciona', h2: 'Das regras da empresa a um modelo publicado',
          sub: 'Todas as capturas abaixo são o design do Team com dados de exemplo. A interface está em espanhol.',
          steps: [
            { h: 'Escreva as regras uma vez, como frases', p: 'Classe, condição, requisito e gravidade, incluindo geometria (espaço livre à frente das portas, pé-direito livre) e relações (porta numa parede). Cada regra é IDS 1.0.', alt: 'Editor de regras com regras de geometria e de relação, resultados no modelo de exemplo e uma ocorrência criada com a sua correção', cap: 'Regras de geometria e de relação verificadas num modelo de exemplo.' },
            { h: 'Gira-as como empresa', p: 'Uma biblioteca partilhada com versões, autor, revisão e aprovação (o autor não aprova a sua própria regra), comentários e exportação para IDS.', alt: 'Biblioteca de regras da empresa com uma versão em revisão, as alterações da v2 para a v3 e comentários', cap: 'Um conjunto de regras em revisão: o que mudou, quem o aprova e o histórico.' },
            { h: 'Execute colisões no navegador', p: 'Colisões físicas e de folga entre disciplinas, agrupadas, com regras para ignorar o que foi aceite e um custo estimado para cada uma.', alt: 'Painel de colisões no modelo de uma torre com regras de ignorar que ocultam colisões aceites', cap: 'Regras de ignorar no modelo de uma torre: 1.569 de 4.827 resultados ocultos.' },
            { h: 'Transforme cada falha numa ocorrência com correção', p: 'Atribuído, com prazo, a câmara guardada e uma correção sugerida por ferramenta de autoria a partir dos nossos guias de correção. Os convidados comentam grátis; BCF de entrada e saída.', alt: 'Ocorrência com uma correção sugerida para várias ferramentas de autoria, responsável, prazo e comentários', cap: 'Uma ocorrência com a sua correção sugerida, responsável e prazo.' },
            { h: 'Trave um modelo fraco antes de ser publicado', p: 'Nada chega a Publicado abaixo da sua pontuação mínima, com um revisor opcional e um histórico do que passou e porquê.', alt: 'Controlo de publicação com uma pontuação mínima de 80 e o histórico de modelos publicados e retidos', cap: 'O controlo de publicação e o seu histórico.' },
            { h: 'Mantenha o cliente informado', p: 'Atualizações por fase construídas com dados em tempo real: pontuação, entregas, ocorrências e marcos. Na pré-visualização o envio é simulado.', alt: 'Ecrã de atualização ao cliente a escolher uma fase, um modelo de texto e os destinatários', cap: 'Uma atualização ao cliente por fase do projeto.' },
          ],
        },
        {
          kind: 'table', label: 'Poupança estimada', h2: 'Cerca de 17 horas por mês, segundo os nossos pressupostos',
          sub: 'Uma estimativa para uma equipa de três, não uma medição. Troque os números pelos seus.',
          head: ['Tarefa', 'Pressuposto', 'Parte poupada (pressuposta)', 'Minutos por mês'],
          rows: [
            ['Verificar entregas antes de enviar', '12 entregas × 60 min', '60 %', '432'],
            ['Preparar a reunião de colisões', '4 reuniões × 90 min', '70 %', '252'],
            ['Refazer entregas devolvidas', '3 devoluções × 120 min', '50 %', '180'],
            ['Escrever atualizações para o cliente', '8 atualizações × 30 min', '70 %', '168'],
            ['Total', '', '', '1.032 min ≈ 17 h'],
          ],
          after: [
            'A 45 € por hora, são cerca de 775 € por mês. O Team está previsto a 59 € por editor por mês com faturação anual, com um mínimo de três editores (177 € por mês), pelo que, com estes pressupostos, paga cerca de quatro vezes o seu custo.',
          ],
        },
        {
          kind: 'table', label: 'Comparação', h2: 'Ao lado das ferramentas de coordenação habituais',
          sub: 'Cada coluna de fornecedor diz apenas o que a página desse fornecedor dizia no dia em que a lemos.',
          head: ['', 'BIMcollab', 'Solibri', 'IFC Viewer Online Team (pré-visualização)'],
          rows: [
            ['Preço publicado', 'Basic 12,50 €, Advanced 18,75 €, Enterprise 25 € por utilizador por mês com faturação anual', 'Por licença por ano: Essential 1.428 €, Advanced 2.109 €, Premium 2.772 €', 'Previsto: 59 € por editor por mês com faturação anual, mínimo três editores. Ainda não está à venda'],
            ['Ocorrências', 'Gestão de ocorrências baseada em BCF com plug-ins para ferramentas BIM', 'Gestão de ocorrências BCF a partir do Essential', 'Ocorrências com câmara, prazo e correção sugerida; BCF de entrada e saída (pré-visualização)'],
            ['Regras', 'Regras de colisão e smart views partilhadas para usar no BIMcollab Zoom', 'Regras predefinidas a partir do Essential; regras próprias a partir do Advanced; governação de regras no Premium', 'Regras como frases, IDS 1.0, biblioteca partilhada com aprovação (pré-visualização)'],
            ['Convidados', 'Uma ou duas contas de convidado por utilizador pago, consoante o plano', 'Não indicado na página de preços', 'Os convidados comentam grátis'],
          ],
          after: [
            'O Solibri é a melhor escolha para uma verificação profunda por regras no computador e o BIMcollab para um fluxo de ocorrências amplo entre ferramentas. O Team é para ateliers que querem regras, colisões, ocorrências e a atualização ao cliente num só sítio, no navegador.',
          ],
          sources: ['bimcollab', 'solibri'],
        },
        {
          kind: 'cols', label: 'Grátis e pré-visualização', h2: 'O que funciona hoje e o que é pré-visualização',
          cols: [
            { h: 'Grátis, disponível hoje', items: ['Abrir e federar vários ficheiros IFC no navegador', 'Verificar cada modelo com o seu IDS 1.0 e 44 regras', 'Importar e exportar BCF, comparar versões', 'Os [guias de correção](fix) de cada regra'] },
            { h: 'Plano Team, em pré-visualização', items: ['Biblioteca de regras da empresa com aprovação', 'Deteção de colisões entre disciplinas', 'Ocorrências partilhados com correção sugerida, controlo de publicação', 'Atualizações ao cliente por fase'] },
          ],
        },
      ],
      faq: [
        ['Posso usar o Team hoje?', 'Ainda não. Está desenhado e é mostrado com dados de exemplo. [Entre na lista de espera](pricing) para saber quando abre. Verificar um modelo com o seu IDS é gratuito e funciona hoje no [visualizador](viewer).'],
        ['A deteção de colisões é gratuita?', 'Não. A deteção de colisões entre disciplinas é uma ferramenta nova e será paga. Abrir, federar e verificar cada modelo continua gratuito. Mais no artigo sobre [deteção de colisões no navegador](postClash).'],
        ['Podemos usar o IDS do nosso cliente?', 'Sim, e essa parte é gratuita hoje. No Team pode também importar um IDS para a biblioteca da empresa e manter as suas versões.'],
        ['Substitui o BIMcollab ou o Solibri?', 'Não para todas as equipas. Veja a comparação acima, com os preços das suas páginas e a data em que as lemos.'],
        ['Quanto vai custar?', 'Está previsto a 59 € por editor por mês com faturação anual, mínimo três editores; os convidados são gratuitos. Os preços podem mudar antes do lançamento; veja os [planos](pricing).'],
        ['Podemos verificar uma pasta inteira de modelos?', 'Isso também faz parte da pré-visualização paga: leia como funciona a [validação em lote](postBatch).'],
      ],
      faqSources: ['bimcollab', 'solibri'],
      bottom: ['Coordena várias disciplinas?', 'Entre na lista de espera do Team e diga-nos quantos editores tem. Escrevemos quando abrir.'],
    },
  },
}
