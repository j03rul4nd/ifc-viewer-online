// Portuguese (Brazilian, like the rest of the site) copy of the two solution pages. Source: copy-en.ts.
// Rules for translators: scripts/seo/solution-landings/TRANSLATING.md.
import type { LangCopy } from './types'

export const copy: LangCopy = {
  ui: {
    home: 'IFC Viewer Online',
    sources: 'Fontes',
    readOn: 'consultado em',
    preview: 'Prévia',
    faqLabel: 'Perguntas frequentes',
    faqTitle: 'O que os compradores perguntam',
    related: 'Relacionado',
    pricing: 'Planos e preços',
    postReception: 'Revisar os modelos IFC dos subempreiteiros',
    postClash: 'Detecção de conflitos no navegador',
    postBatch: 'Validar muitos arquivos IFC de uma vez',
    postSupplier: 'Página de envio para fornecedores sem conta',
  },
  pages: {
    contractors: {
      title: 'Recepção de modelos IFC para construtoras e incorporadoras',
      desc: 'Os subempreiteiros verificam o IFC com os seus requisitos, grátis, antes de enviar; você só revisa o que passa. Plano Reception em prévia.',
      nav: 'Para construtoras',
      kicker: 'Para construtoras e incorporadoras · Plano Reception · Prévia',
      h1: ['Receba apenas modelos IFC que já cumprem', 'para construtoras e incorporadoras que recebem modelos dos subempreiteiros'],
      lead: 'Publique os seus requisitos em um único link. Cada subempreiteiro verifica o modelo com eles, gratuitamente, no navegador, e o corrige antes de enviar. Você vê quem entregou, o que cumpre e por que o resto é devolvido, com um relatório pronto para o cliente.',
      cta: 'Fale conosco',
      cta2: 'Como funciona a revisão',
      note: 'Prévia: o plano Reception está projetado e é mostrado aqui com dados de exemplo. Ainda não está à venda e nada é salvo. Verificar um modelo é gratuito e funciona hoje.',
      hero: {
        alt: 'Resumo do Reception de um projeto residencial com dados de exemplo: ações de hoje, horas e euros economizados estimados e fornecedores por marco',
        cap: 'A obra em um relance, com dados de exemplo: o que revisar hoje, a economia estimada com as suas premissas e cada fornecedor por marco. Interface em espanhol.',
      },
      sections: [
        {
          kind: 'text', label: 'O problema', h2: 'Os modelos ruins são descobertos por quem os recebe',
          ps: [
            'Segundo a ISO 19650-2, revisar e aceitar o modelo de informação é uma atividade da parte contratante: a construtora ou a incorporadora que o recebe. A orientação do UK BIM Framework descreve essa verificação como parte do fluxo do ambiente comum de dados.',
            'A Skanska UK afirma que os seus objetivos dependem "critically" (de forma crítica) de receber informação de qualidade da sua cadeia de suprimentos. Os BIM managers de construtoras descrevem dificuldades consideráveis para fazer a informação descer e subir pela cadeia por e-mail e FTP.',
            'Na prática, um coordenador abre cada entrega, encontra as mesmas propriedades faltando e os mesmos nomes errados, escreve os motivos à mão e espera a versão seguinte. O subempreiteiro só conhece as regras depois de ser rejeitado.',
          ],
          sources: ['ukbimPartC', 'skanska', 'cmTier2'],
        },
        {
          kind: 'flow', label: 'Como funciona', h2: 'Dos seus requisitos ao relatório para o cliente',
          sub: 'Todas as capturas abaixo mostram o design do Reception com dados de exemplo (projeto «Mirador del Turia», dez fornecedores). A interface está em espanhol.',
          steps: [
            { h: 'Publique os seus requisitos como link', p: 'Regras, IDS e pontuação mínima por status ISO 19650. Os subempreiteiros recebem a versão aprovada; um link antigo continua funcionando.', alt: 'Biblioteca de regras com uma mudança de versão, o seu efeito no mesmo modelo e um botão para criar o link para os subempreiteiros', cap: 'O que muda entre versões de regras e o link que vai para os subempreiteiros.' },
            { h: 'Os subempreiteiros verificam grátis antes de enviar', p: 'Sem conta. Eles veem a pontuação, o que falha, os elementos envolvidos e o [guia de correção](fix) de cada regra, então a maioria dos erros é corrigida antes de chegar até você.', alt: 'Página de fornecedor sem conta com uma pontuação de 84, um nome de arquivo errado e a lista do que corrigir', cap: 'A página que um subempreiteiro vê: o que passa, o que falha e como renomear o arquivo.' },
            { h: 'Revise uma fila, não uma caixa de entrada', p: 'As entregas chegam já verificadas, com o nome do arquivo lido segundo a ISO 19650 e um antes e depois em relação à versão anterior. Os atalhos de teclado levam você pela fila.', alt: 'Diálogo de revisão com quatro versões de uma entrega, o nome de arquivo ISO 19650 separado em campos e a pontuação de requisitos', cap: 'Uma entrega: as suas versões, o nome do arquivo campo a campo e os requisitos.' },
            { h: 'Devolva com motivos que o fornecedor possa resolver', p: 'Cada motivo aponta para os elementos em 3D e para como corrigi-los. Tudo fica registrado com um hash encadeado e é exportado para CSV.', alt: 'Decisão de devolver uma entrega com os motivos reprovados marcados e os elementos listados', cap: 'Devolver um modelo: os motivos, os elementos e uma nota para o fornecedor.' },
            { h: 'Acompanhe os conflitos entre disciplinas ao longo do tempo', p: 'Detecção de conflitos no navegador, ordenada por custo estimado, com a tendência entre execuções.', alt: 'Painel de conflitos com a tendência entre execuções e os conflitos ordenados por custo estimado', cap: 'Conflitos com a sua tendência e custo estimado (hotel federado de exemplo).' },
            { h: 'Mantenha o cliente informado sem escrever nada', p: 'Uma página de projeto com a última pontuação, as entregas aceitas, os conflitos resolvidos e o próximo marco. Na prévia o envio é simulado.', alt: 'Página de projeto para o cliente com o Health Score do modelo, os conflitos resolvidos e a linha do tempo', cap: 'O que o cliente vê ao abrir o link de atualização.' },
            { h: 'Envie o relatório semanal à gerência de obra', p: 'Recebido, aprovado, faltando e o tempo economizado estimado, já escrito para copiar ou baixar.', alt: 'Relatório semanal de entregas para a gerência de obra com um resumo por fornecedor', cap: 'O relatório semanal, gerado a partir das entregas.' },
          ],
        },
        {
          kind: 'table', label: 'Economia estimada', h2: 'Cerca de 22 horas por mês de um coordenador, segundo as nossas premissas',
          sub: 'Uma estimativa, não uma medição. Troque os números pelos seus: o resumo do Reception permite editar cada premissa.',
          head: ['Tarefa', 'Premissa', 'Parte economizada (estimada)', 'Minutos por mês'],
          rows: [
            ['Revisar entregas à mão', '40 entregas × 25 min', '80 %', '800'],
            ['Preparar a reunião de coordenação', '4 reuniões × 90 min', '70 %', '252'],
            ['Escrever o relatório para o cliente', '8 relatórios × 45 min', '80 %', '288'],
            ['Total', '', '', '1.340 min ≈ 22 h'],
          ],
          after: [
            'A 45 € por hora, são cerca de 1.000 € por mês. O plano Reception está previsto a partir de 290 € por projeto por mês, então, com essas premissas, ele se paga cerca de três vezes. Retrabalho e multas evitados não são contabilizados.',
          ],
        },
        {
          kind: 'table', label: 'Comparação', h2: 'Ao lado de um ambiente comum de dados',
          sub: 'Cada coluna de fornecedor mostra apenas o que a página desse fornecedor dizia no dia em que a lemos. Quando a página não diz nada, a célula indica isso.',
          head: ['', 'Catenda Hub', 'Dalux Box', 'Autodesk Construction Cloud', 'IFC Viewer Online Reception (prévia)'],
          rows: [
            ['Preço publicado', 'Por projeto, segundo o valor da obra: cerca de 400 € por mês para um projeto de 10 M€, cerca de 1.100 € para 50 M€; orçamento sob consulta', 'Nenhum na página do produto; formulário de contato', 'Nenhum; orçamento por pacote, com preços por usuário, projeto e conta', 'Previsto: a partir de 290 € por projeto por mês com 15 fornecedores, ou 790 € ilimitado. Ainda não está à venda'],
            ['Licença necessária para os fornecedores', 'Não: "Your subs don\'t need a licence to log a defect" (os seus subempreiteiros não precisam de licença para registrar um defeito)', 'Não indicado na página', 'Não indicado na página', 'Sem conta: verificam grátis no navegador'],
            ['Verificar modelos com os requisitos', 'Não indicado na página de preços', 'Sim: validar dados e geometria do modelo com os requisitos do projeto', 'O pacote Model Management inclui preparação de modelos, coordenação e detecção de conflitos', 'Regras e IDS 1.0 com uma pontuação por entrega. Verificar é gratuito hoje; a caixa de recebimento está em prévia'],
            ['Aprovação dos modelos recebidos', 'Não indicado na página de preços', 'Fluxos de aprovação e uma convenção de nomes de arquivo obrigatória', 'Não indicado na página de preços', 'Aceitar ou devolver com motivos e elementos em 3D (prévia)'],
          ],
          after: [
            'Não substitui o seu CDE. Fica antes dele: seja qual for o CDE que você usa, o modelo chega já verificado com os seus requisitos, e o fornecedor os conhecia antes de enviar.',
          ],
          sources: ['catenda', 'dalux', 'acc'],
        },
        {
          kind: 'cols', label: 'Grátis e prévia', h2: 'O que funciona hoje e o que está em prévia',
          cols: [
            { h: 'Grátis, disponível hoje', items: ['Abrir e verificar qualquer IFC no navegador, sem enviar nada', 'Os seus arquivos IDS 1.0 e 44 regras com Health Score', 'Importar e exportar BCF, comparar versões', 'Os [guias de correção](fix) de cada regra'] },
            { h: 'Plano Reception, em prévia', items: ['Link de requisitos com versões por status ISO 19650', 'Fila de entregas com aceitar ou devolver com motivos', 'Ficha de fornecedor e registro com hash encadeado', 'Página para o cliente e relatório semanal'] },
          ],
        },
      ],
      faq: [
        ['Posso usar o Reception hoje?', 'Ainda não. Está projetado e é mostrado com dados de exemplo. Se você recebe modelos de subempreiteiros, [fale conosco](pricing): procuramos alguns projetos-piloto. Verificar um modelo com os seus requisitos é gratuito e funciona hoje no [visualizador](viewer).'],
        ['Os subempreiteiros pagam ou precisam de conta?', 'Não. Eles abrem o seu link e verificam o modelo gratuitamente no navegador. Quem paga é quem recebe e gerencia as entregas. Como funciona: [página de envio para fornecedores sem conta](postSupplier).'],
        ['Substitui o Catenda, o Dalux ou o Autodesk Construction Cloud?', 'Não. Verifica o modelo antes de ele chegar ao seu CDE e funciona com qualquer CDE. Cada CDE tem o seu próprio fluxo; veja a comparação acima com a data em que lemos as páginas deles.'],
        ['O modelo é enviado para ser verificado?', 'Na verificação gratuita, não: ela roda no navegador do subempreiteiro. No Reception, a entrega que você aceita é armazenada para você na UE.'],
        ['Quanto vai custar?', 'Está previsto a partir de 290 € por projeto por mês com 15 fornecedores, ou 790 € para projetos ilimitados. Os preços podem mudar antes do lançamento; veja os [planos](pricing).'],
        ['De onde vem o valor da economia?', 'Das premissas da tabela acima: número de entregas, minutos por tarefa e a parte que cada tarefa economiza. São premissas, não medições, e você pode alterá-las no resumo.'],
      ],
      faqSources: ['catenda', 'dalux', 'acc'],
      bottom: ['Você recebe modelos de subempreiteiros?', 'Diga quantos projetos e fornecedores você tem. Estamos escolhendo alguns projetos-piloto para o Reception.'],
    },
    engineering: {
      title: 'Coordenação BIM para escritórios de engenharia — plano Team',
      desc: 'Modelos aceitos na primeira entrega: regras compartilhadas, conflitos, ocorrências com correção e controle de publicação. Plano Team em prévia.',
      nav: 'Para escritórios de engenharia',
      kicker: 'Para escritórios de engenharia e de projeto · Plano Team · Prévia',
      h1: ['Entregue modelos que o cliente aceita na primeira vez', 'para escritórios de engenharia e de projeto que coordenam várias disciplinas'],
      lead: 'Um único conjunto de regras do escritório, detecção de conflitos no navegador, ocorrências com a câmera e uma correção sugerida, e um controle que impede publicar um modelo abaixo da sua pontuação mínima. O cliente vê o progresso sem que você precise escrevê-lo.',
      cta: 'Entrar na lista de espera do Team',
      cta2: 'Detecção de conflitos no navegador',
      note: 'Prévia: o plano Team está projetado e é mostrado aqui com dados de exemplo. Ainda não está à venda e nada é salvo. Verificar um modelo com o seu IDS é gratuito e funciona hoje.',
      hero: {
        alt: 'Painel do Team com dados de exemplo: Health Score por projeto e a sua tendência, ocorrências abertas por pessoa e prazos em risco',
        cap: 'O painel da equipe, com dados de exemplo: saúde de cada projeto, carga por pessoa e prazos em risco. Interface em espanhol.',
      },
      sections: [
        {
          kind: 'text', label: 'O problema', h2: 'As rejeições vêm de detalhes que ninguém verificou',
          ps: [
            'Os clientes já enviam os seus próprios requisitos de informação, muitas vezes em IDS. Uma entrega sem um nome de propriedade ou uma classificação é devolvida, e corrigi-la custa mais do que teria custado verificá-la.',
            'Um consultor BIM descreve um problema de validação de dados IFC que custou semanas, causado por nomes de propriedades que não correspondiam ao exigido. A ISO 19650-2 faz da verificação antes de compartilhar uma etapa da equipe de entrega, não do cliente.',
            'Em um escritório, as regras vivem na cabeça ou na planilha de uma pessoa, os conflitos são revisados em reunião e as ocorrências acabam em cadeias de e-mail sem a vista que as explica.',
          ],
          sources: ['bimCorner', 'ukbimPartC'],
        },
        {
          kind: 'flow', label: 'Como funciona', h2: 'Das regras do escritório a um modelo publicado',
          sub: 'Todas as capturas abaixo mostram o design do Team com dados de exemplo. A interface está em espanhol.',
          steps: [
            { h: 'Escreva as regras uma vez, como frases', p: 'Classe, condição, requisito e gravidade, incluindo geometria (espaço livre na frente das portas, pé-direito livre) e relações (porta em uma parede). Cada regra é IDS 1.0.', alt: 'Editor de regras com regras de geometria e de relação, resultados no modelo de exemplo e uma ocorrência criada com a sua correção', cap: 'Regras de geometria e de relação verificadas em um modelo de exemplo.' },
            { h: 'Gerencie-as como escritório', p: 'Uma biblioteca compartilhada com versões, autor, revisão e aprovação (o autor não aprova a própria regra), comentários e exportação para IDS.', alt: 'Biblioteca de regras do escritório com uma versão em revisão, as alterações da v2 para a v3 e comentários', cap: 'Um conjunto de regras em revisão: o que mudou, quem aprova e o histórico.' },
            { h: 'Execute a detecção de conflitos no navegador', p: 'Conflitos físicos e de folga entre disciplinas, agrupados, com regras para ignorar o que foi aceito e um custo estimado para cada um.', alt: 'Painel de conflitos no modelo de uma torre com regras de exclusão que ocultam conflitos aceitos', cap: 'Regras de exclusão no modelo de uma torre: 1.569 de 4.827 resultados ocultos.' },
            { h: 'Transforme cada falha em uma ocorrência com correção', p: 'Atribuída, com prazo, a câmera salva e uma correção sugerida por ferramenta de autoria, a partir dos nossos guias de correção. Os convidados comentam grátis; BCF de entrada e saída.', alt: 'Ocorrência com uma correção sugerida para várias ferramentas de autoria, responsável, prazo e comentários', cap: 'Uma ocorrência com a sua correção sugerida, responsável e prazo.' },
            { h: 'Barre um modelo fraco antes da publicação', p: 'Nada chega a Publicado abaixo da sua pontuação mínima, com um revisor opcional e um histórico do que passou e por quê.', alt: 'Controle de publicação com uma pontuação mínima de 80 e o histórico de modelos publicados e retidos', cap: 'O controle de publicação e o seu histórico.' },
            { h: 'Mantenha o cliente informado', p: 'Atualizações por fase montadas com dados em tempo real: pontuação, entregas, ocorrências e marcos. Na prévia o envio é simulado.', alt: 'Tela de atualização para o cliente escolhendo uma fase, um modelo de texto e os destinatários', cap: 'Uma atualização para o cliente por fase do projeto.' },
          ],
        },
        {
          kind: 'table', label: 'Economia estimada', h2: 'Cerca de 17 horas por mês, segundo as nossas premissas',
          sub: 'Uma estimativa para uma equipe de três pessoas, não uma medição. Troque os números pelos seus.',
          head: ['Tarefa', 'Premissa', 'Parte economizada (estimada)', 'Minutos por mês'],
          rows: [
            ['Verificar entregas antes de enviar', '12 entregas × 60 min', '60 %', '432'],
            ['Preparar a reunião de coordenação', '4 reuniões × 90 min', '70 %', '252'],
            ['Refazer entregas devolvidas', '3 devoluções × 120 min', '50 %', '180'],
            ['Escrever atualizações para o cliente', '8 atualizações × 30 min', '70 %', '168'],
            ['Total', '', '', '1.032 min ≈ 17 h'],
          ],
          after: [
            'A 45 € por hora, são cerca de 775 € por mês. O Team está previsto a 59 € por editor por mês com cobrança anual, com um mínimo de três editores (177 € por mês), então, com essas premissas, ele se paga cerca de quatro vezes.',
          ],
        },
        {
          kind: 'table', label: 'Comparação', h2: 'Ao lado das ferramentas de coordenação habituais',
          sub: 'Cada coluna de fornecedor mostra apenas o que a página desse fornecedor dizia no dia em que a lemos.',
          head: ['', 'BIMcollab', 'Solibri', 'IFC Viewer Online Team (prévia)'],
          rows: [
            ['Preço publicado', 'Basic 12,50 €, Advanced 18,75 €, Enterprise 25 € por usuário por mês com cobrança anual', 'Por licença por ano: Essential 1.428 €, Advanced 2.109 €, Premium 2.772 €', 'Previsto: 59 € por editor por mês com cobrança anual, mínimo três editores. Ainda não está à venda'],
            ['Ocorrências', 'Gestão de ocorrências baseada em BCF com plug-ins para ferramentas BIM', 'Gestão de ocorrências BCF a partir do Essential', 'Ocorrências com câmera, prazo e correção sugerida; BCF de entrada e saída (prévia)'],
            ['Regras', 'Regras de conflito e smart views compartilhadas para usar no BIMcollab Zoom', 'Regras predefinidas a partir do Essential; regras próprias a partir do Advanced; governança de regras no Premium', 'Regras como frases, IDS 1.0, biblioteca compartilhada com aprovação (prévia)'],
            ['Convidados', 'Uma ou duas contas de convidado por usuário pagante, dependendo do plano', 'Não indicado na página de preços', 'Os convidados comentam grátis'],
          ],
          after: [
            'O Solibri é a escolha mais forte para uma verificação profunda por regras no desktop, e o BIMcollab para um fluxo amplo de ocorrências entre ferramentas. O Team é para escritórios que querem regras, conflitos, ocorrências e a atualização ao cliente em um só lugar, no navegador.',
          ],
          sources: ['bimcollab', 'solibri'],
        },
        {
          kind: 'cols', label: 'Grátis e prévia', h2: 'O que funciona hoje e o que está em prévia',
          cols: [
            { h: 'Grátis, disponível hoje', items: ['Abrir e federar vários arquivos IFC no navegador', 'Verificar cada modelo com o seu IDS 1.0 e 44 regras', 'Importar e exportar BCF, comparar versões', 'Os [guias de correção](fix) de cada regra'] },
            { h: 'Plano Team, em prévia', items: ['Biblioteca de regras do escritório com aprovação', 'Detecção de conflitos entre disciplinas', 'Ocorrências compartilhadas com correção sugerida, controle de publicação', 'Atualizações para o cliente por fase'] },
          ],
        },
      ],
      faq: [
        ['Posso usar o Team hoje?', 'Ainda não. Está projetado e é mostrado com dados de exemplo. [Entre na lista de espera](pricing) para saber quando abrir. Verificar um modelo com o seu IDS é gratuito e funciona hoje no [visualizador](viewer).'],
        ['A detecção de conflitos é gratuita?', 'Não. A detecção de conflitos entre disciplinas é uma ferramenta nova e será paga. Abrir, federar e verificar cada modelo continua gratuito. Mais no artigo sobre [detecção de conflitos no navegador](postClash).'],
        ['Podemos usar o IDS do nosso cliente?', 'Sim, e essa parte é gratuita hoje. No Team você também pode importar um IDS para a biblioteca do escritório e manter as suas versões.'],
        ['Substitui o BIMcollab ou o Solibri?', 'Não para todas as equipes. Veja a comparação acima, com os preços das páginas deles e a data em que as lemos.'],
        ['Quanto vai custar?', 'Está previsto a 59 € por editor por mês com cobrança anual, mínimo três editores; os convidados são gratuitos. Os preços podem mudar antes do lançamento; veja os [planos](pricing).'],
        ['Podemos verificar uma pasta inteira de modelos?', 'Isso também faz parte da prévia paga: leia como funciona a [validação em lote](postBatch).'],
      ],
      faqSources: ['bimcollab', 'solibri'],
      bottom: ['Você coordena várias disciplinas?', 'Entre na lista de espera do Team e diga quantos editores você tem. Escreveremos quando abrir.'],
    },
  },
}
