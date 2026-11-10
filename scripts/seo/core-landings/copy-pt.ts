import type { LangCopy } from './types'

// Portuguese (pt_PT) copy for the six landing families. Translated from
// copy-en.ts: same structure, same figures, vendor quotes left in English.

export const copy: LangCopy = {
  ui: {
    home: 'IFC Viewer Online',
    sources: 'Fontes',
    readOn: 'consultado em',
    faqLabel: 'FAQ',
    faqTitle: 'Perguntas',
    related: 'Páginas relacionadas',
    fix: 'Corrigir erros IFC',
    blogSolibri: 'Solibri ou um validador no navegador: a comparação completa',
    pricing: 'Preços',
    embedCta: 'Executar a validação num IFC de exemplo',
    embedSub: 'Carrega o validador nesta página. Nada é enviado para um servidor.',
  },
  pages: {
    // ─────────────────────────────────────────────────────────────────────────
    validator: {
      title: 'Validação IFC Online — Validador IFC Grátis, 44 Regras',
      desc: 'Verifique um ficheiro IFC no navegador: 44 regras, IDS 1.0 e Health Score de 0 a 100. O ficheiro não é carregado. Grátis, sem conta. IFC2x3, IFC4, IFC4x3.',
      nav: 'Validador IFC',
      kicker: '44 regras · IDS 1.0 · O ficheiro fica no seu navegador · Grátis',
      h1: ['Validação IFC Online', 'O que está errado no ficheiro, e onde'],
      lead: 'Largue um ficheiro IFC e obtenha um Health Score de 0 a 100, a lista de problemas agrupados por regra e os elementos que falham realçados no modelo 3D. O ficheiro é lido no separador do seu navegador e não é carregado para nenhum servidor.',
      cta: 'Validar um ficheiro IFC',
      cta2: 'ou abrir o modelo de exemplo',
      note: 'Sem conta. IFC2x3, IFC4, IFC4x1 e IFC4x3, até 2 GB por ficheiro.',
      shots: [
        { alt: 'Validação IFC de uma moradia de dois pisos no navegador: Health Score 77, um erro e 161 avisos, as três correções que recuperam mais pontos e a vista 3D a percorrer os 119 elementos sem tipo', cap: 'O modelo de exemplo público Duplex (2,3 MB, 7.181 entidades) obtém 77. "Show in 3D" na primeira correção enquadra os 119 elementos sem tipo, com um contador para os percorrer um a um.' },
        { alt: 'Lista de problemas de validação IFC agrupados por regra, com o número de elementos que falham em cada regra e a explicação de como a corrigir', cap: 'Cada regra abre-se para mostrar os seus elementos e os passos que a corrigem no Revit, no Archicad ou no Tekla.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'Âmbito', h2: 'O que a verificação cobre, e o que não cobre',
          sub: 'São 44 regras em oito grupos. 25 correm por omissão; as outras 19 ativam-se a partir de um perfil, porque precisam de uma decisão sua (um nível de LOD, um padrão de nomenclatura, um sistema de classificação).',
          cols: [
            { h: 'Verifica', items: [
              'Identificadores: GlobalIds duplicados e GlobalIds que não são GUIDs IFC válidos de 22 caracteres.',
              'Estrutura: um único IfcProject, a cadeia Project → Site → Building → Storey, elementos sem piso, agregações quebradas ou circulares, aberturas sem elemento hospedeiro.',
              'Pisos: cotas em falta, duplicadas ou fora de ordem.',
              'Dados: nomes vazios, nomes duplicados, valores de propriedades vazios, elementos sem tipo ou sem material, espaços sem área de pavimento.',
              'Qualidade da exportação: mais de 5% dos elementos como IfcBuildingElementProxy, um modelo a mais de 10 km da origem, mais de 500 KB por elemento, unidades de comprimento imperiais.',
              'A pedido: conjuntos de propriedades obrigatórios por classe, padrões de nomenclatura, classificação, propriedades e quantidades de LOD 100–400, campos de projeto e de autor da ISO 19650, sistemas MEP.',
              'Os seus próprios requisitos: um ficheiro IDS 1.0, um dos cinco perfis incluídos (entrega básica, revisão de qualidade, coordenação BIM, ISO 19650, LOD 300) ou um perfil definido por si.',
            ] },
            { h: 'Não verifica', items: [
              'Colisões entre dois modelos. As regras de colisão comparam caixas envolventes dentro de um só modelo, com uma sobreposição de 5 cm, até 800 elementos e 100 resultados. São um primeiro filtro, não são coordenação.',
              'Regulamentos de construção: acessibilidade, segurança contra incêndio, caminhos de evacuação ou alturas livres. Nenhuma regra aqui lê um regulamento.',
              'Todo o esquema IFC. Não é um teste de conformidade EXPRESS: corre estas 44 regras e o seu IDS.',
              'Códigos da ISO 19650. A regra do nome do ficheiro lê o nome escrito no cabeçalho do IFC e conta os seus campos; não verifica cada código.',
              'Ficheiros nativos. Lê IFC, não ficheiros do Revit nem do Archicad.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Limites', h2: 'Limites, com números',
          head: ['', 'Limite'],
          rows: [
            ['Tamanho do ficheiro', 'A partir de 2 GB, o ficheiro é recusado. Aparece uma nota a partir de 200 MB e um aviso de memória a partir de 1 GB. Em telemóveis, tablets e computadores com 4 GB de memória ou menos, o aviso começa nos 80 MB.'],
            ['Formatos', 'IFC2x3, IFC4, IFC4x1 e IFC4x3, como .ifc ou dentro de .ifczip e .zip.'],
            ['Regras', '44 no total, 25 ativas por omissão. A gravidade e os limiares podem ser alterados regra a regra.'],
            ['IDS', 'IDS 1.0 com as suas seis facetas. As restrições totalDigits, fractionDigits e whiteSpace não são lidas. São listados até 200 elementos que falham por especificação.'],
            ['Correções automáticas', 'GlobalIds inválidos e duplicados, e nomes vazios ou duplicados. Tudo o resto é editado à mão ou corrigido no software de modelação.'],
            ['Velocidade', 'O modelo de exemplo da imagem (2,3 MB, 7.181 entidades) foi validado em cerca de 20 segundos no computador usado para estas capturas. O tempo cresce com o número de entidades.'],
            ['Ligação', 'A página tem de ser carregada a partir da internet. Não funciona offline.'],
          ],
        },
        {
          kind: 'text', label: 'O seu ficheiro', h2: 'O que acontece ao ficheiro',
          ps: [
            'O IFC é aberto por código que corre no separador do seu navegador. Não é enviado para nós nem para mais ninguém, por isso não há carregamento por que esperar nem nada para apagar depois.',
            'Para reabrir um modelo mais depressa, o navegador guarda uma cópia convertida da sua geometria no seu próprio armazenamento privado, no seu computador (até 4 GB; as cópias mais antigas saem primeiro). Limpar os dados do site no navegador remove-a.',
            'Há duas coisas que saem do navegador, e ambas estão sob o seu controlo. As estatísticas de utilização sem cookies registam que um ficheiro foi aberto, o seu tamanho e o seu número de elementos, nunca o seu conteúdo; podem ser desligadas e respeitam o Do Not Track. E se clicar em Share, a própria ligação transporta a pontuação, o nome do ficheiro e os 50 primeiros problemas com os nomes dos respetivos elementos, pelo que qualquer pessoa com a ligação os pode ler.',
          ],
        },
        { kind: 'shot', label: 'O resultado', h2: 'Da pontuação ao elemento', sub: 'Experimente aqui com o modelo de exemplo e depois abra o seu próprio ficheiro.' },
        {
          kind: 'steps', label: 'Como funciona', h2: 'Do ficheiro a um IFC corrigido',
          steps: [
            ['Abra o ficheiro', 'Arraste o .ifc para a página. Podem estar vários ficheiros abertos ao mesmo tempo; cada um é validado separadamente.'],
            ['Leia o veredicto', 'A pontuação, os erros e avisos, e as três correções que recuperam mais pontos. Um clique realça os elementos que falham.'],
            ['Corrija o que pode ser corrigido aqui', 'Regenere GlobalIds inválidos, renomeie em massa, edite nomes e valores de propriedades. Todas as edições podem ser anuladas.'],
            ['Exporte', 'O IFC corrigido, escrito de novo pelo parser, e os resultados em BCF 2.1, CSV, JSON, um relatório de entrega em HTML ou uma folha de cálculo COBie.'],
          ],
        },
        {
          kind: 'text', label: 'Preço', h2: 'Quanto custa',
          ps: [
            'Nada. O visualizador, as 44 regras, o IDS, as correções e todas as exportações desta página são gratuitos, sem conta, também para trabalho comercial. O código-fonte é público sob a licença MIT no [GitHub](github).',
            'Os planos pagos (Pro a 19 € por mês, Team a 35 € por editor por mês) são para o que precisa de um servidor, como guardar modelos e conjuntos de regras. Ainda não estão à venda; a [página de preços](pricing) indica o que cada um vai incluir.',
          ],
        },
      ],
      faq: [
        ['O ficheiro IFC é carregado para um servidor?', 'Não. O ficheiro é lido por código que corre no separador do seu navegador. Só saem do navegador as estatísticas de utilização anónimas (tamanho do ficheiro e número de elementos, nunca o conteúdo) e as ligações de partilha que o próprio utilizador cria.'],
        ['Que versões de IFC lê?', 'IFC2x3, IFC4, IFC4x1 e IFC4x3, como ficheiros .ifc ou dentro de arquivos .ifczip e .zip. Os ficheiros de 2 GB ou mais são recusados.'],
        ['Substitui uma ferramenta de deteção de colisões?', 'Não. As regras de colisão comparam caixas envolventes dentro de um único modelo e estão desligadas por omissão. Encontram sobreposições evidentes antes de enviar um modelo; a coordenação entre especialidades precisa de uma ferramenta de colisões.'],
        ['Posso verificar um modelo face aos meus próprios requisitos?', 'Sim. Carregue um ficheiro IDS 1.0, ou parta de um dos sete conjuntos de requisitos prontos a usar (entrega ISO 19650, LOD 200 e LOD 400, entrega COBie e outros). Também pode criar um perfil de validação com os seus próprios padrões de nomenclatura e conjuntos de propriedades obrigatórios.'],
        ['Posso corrigir os erros e exportar o IFC de novo?', 'Os GlobalIds e os nomes podem ser corrigidos automaticamente; os nomes, as descrições e os valores de propriedades podem ser editados à mão, com anulação. A exportação escreve o IFC de novo com essas alterações. A geometria e as relações não podem ser editadas.'],
        ['Funciona sem ligação à internet?', 'Não. A página tem de ser carregada a partir da internet. Para redes sem acesso à internet existe uma [instalação on-premise](onprem).'],
      ],
      bottom: ['Verifique um ficheiro agora', 'Grátis, sem conta, e o ficheiro fica no seu navegador.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    cloud: {
      title: 'Validador IFC na Nuvem — Valide online sem carregar',
      desc: 'Verificação IFC a partir de uma página web sem carregar o modelo: 44 regras, IDS 1.0 e Health Score calculado no navegador. Grátis, sem conta, até 2 GB.',
      nav: 'Validador IFC na nuvem',
      kicker: 'Online · Sem carregamento · 44 regras · IDS 1.0 · Grátis',
      h1: ['Validador IFC na nuvem', 'sem o carregamento'],
      lead: 'Uma ferramenta de verificação IFC na nuvem significa normalmente enviar o modelo para o servidor de outra entidade. Esta é uma página web que faz o trabalho no seu próprio navegador: a mesma comodidade, e o ficheiro nunca sai do seu computador.',
      cta: 'Validar um ficheiro IFC',
      cta2: 'ou abrir o modelo de exemplo',
      note: 'Sem conta. Funciona no Chrome, Edge, Firefox e Safari. Até 2 GB por ficheiro.',
      shots: [
        { alt: 'Verificação IDS de um modelo IFC no navegador: a especificação "Walls declare a FireRating in Pset_WallCommon" falha nas 57 paredes de uma moradia de dois pisos mostrada em 3D', cap: 'Um IDS 1.0 de exemplo verificado face ao modelo: nenhuma das 57 paredes declara uma resistência ao fogo. O modelo e o IDS são ambos lidos no separador do navegador.' },
        { alt: 'Janela de exportação de uma validação IFC com os formatos JSON, CSV, certificado, BCF, relatório de entrega e COBie', cap: 'Os resultados saem como ficheiros que descarrega: BCF 2.1, CSV, JSON, um relatório de entrega em HTML ou uma folha de cálculo COBie.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Carregamento ou navegador', h2: 'Um serviço de verificação que carrega o modelo, e uma página que não o faz',
          sub: 'O Solibri WebChecker é o exemplo publicado mais claro de um serviço de verificação na nuvem, por isso é a comparação usada aqui. A coluna dele cita a página da própria Solibri.',
          head: ['', 'Solibri WebChecker (Beta)', 'IFC Viewer Online'],
          rows: [
            ['Para onde vai o modelo', 'É carregado para o serviço. Os dados são guardados na UE ou nos EUA, conforme escolhido na configuração do projeto', 'Para lado nenhum. É lido no separador do seu navegador'],
            ['Durante quanto tempo se guardam os resultados', '30 dias, depois são removidos', 'Até fechar o separador. Fica com o que exportar'],
            ['Tamanho do ficheiro', 'Até 5 GB por ficheiro IFC', 'Menos de 2 GB por ficheiro, e menos ainda num computador com pouca memória'],
            ['Conta', 'Um Solibri ID e um plano Solibri Advanced ou Premium', 'Nenhuma'],
            ['Custo de uma verificação', '50 tokens. O Advanced inclui 1.750 tokens por ano, o Premium 17.500; um pacote de 5.000 tokens custa 250 €', 'Grátis'],
            ['Verificações', 'A verificação Model Health da Solibri, ou um conjunto de regras personalizado (.cset) preparado na aplicação de secretária do Solibri', '44 regras fixas e os seus ficheiros IDS 1.0'],
            ['Resultados', 'PDF e BCF; ficheiros SMC com o Premium', 'BCF 2.1, CSV, JSON, relatório HTML, folha de cálculo COBie. Sem ficheiro PDF: o relatório HTML imprime-se a partir do navegador'],
          ],
          after: [
            'Um servidor justifica-se quando os ficheiros são maiores do que um navegador consegue suportar, quando os resultados têm de ficar disponíveis para toda a equipa de projeto, ou quando as verificações têm de correr sem intervenção. Nada disso acontece aqui: esta página verifica o ficheiro de uma pessoa no computador dessa pessoa.',
            'O navegador ganha quando o modelo não pode sair do edifício, quando ninguém vai aprovar um novo fornecedor esta semana, ou quando só precisa de uma resposta sobre um ficheiro.',
          ],
          sources: ['solibriWebchecker', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Âmbito', h2: 'O que verifica, e o que não verifica',
          cols: [
            { h: 'Verifica', items: [
              '44 regras em oito grupos: identificadores, estrutura espacial, pisos, nomes, valores de propriedades, tipos, materiais, qualidade da exportação. 25 correm por omissão.',
              'Ficheiros IDS 1.0, com as seis facetas: entidade, atributo, propriedade, classificação, material e parte de (part-of).',
              'Cinco perfis de validação incluídos (entrega básica, revisão de qualidade, coordenação BIM, ISO 19650, LOD 300), ou os seus.',
            ] },
            { h: 'Não verifica', items: [
              'Colisões entre modelos. Apenas caixas envolventes dentro de um só modelo, desligadas por omissão.',
              'Regulamentos de construção ou regras de projeto escritas para o seu projeto. Não há editor de regras; os requisitos entram como IDS.',
              'Lotes. Cada ficheiro é aberto por uma pessoa; nada corre de forma agendada.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Limites', h2: 'Limites, com números',
          head: ['', 'Limite'],
          rows: [
            ['Tamanho do ficheiro', 'A partir de 2 GB, o ficheiro é recusado. Aparece uma nota a partir de 200 MB e um aviso de memória a partir de 1 GB; em telemóveis, tablets e computadores com 4 GB de memória ou menos, começa nos 80 MB.'],
            ['Formatos', 'IFC2x3, IFC4, IFC4x1 e IFC4x3, como .ifc ou dentro de .ifczip e .zip.'],
            ['IDS', 'IDS 1.0. As restrições totalDigits, fractionDigits e whiteSpace não são lidas. São listados até 200 elementos que falham por especificação.'],
            ['Partilha', 'Uma ligação de partilha transporta a pontuação e os primeiros 50 problemas dentro do URL, até 8.000 caracteres. O modelo não vai nela.'],
            ['Ligação', 'A página tem de ser carregada a partir da internet. Não funciona offline.'],
          ],
        },
        {
          kind: 'text', label: 'O seu ficheiro', h2: 'O que acontece ao ficheiro',
          ps: [
            'O IFC é aberto por código que corre no separador do seu navegador e não é enviado para lado nenhum. Pode confirmá-lo por si: abra as ferramentas de programador do navegador, observe o separador Network e largue um ficheiro.',
            'O navegador guarda uma cópia convertida da geometria no seu armazenamento privado, no seu computador (até 4 GB), para reabrir o modelo mais depressa. Limpar os dados do site remove-a.',
            'As estatísticas de utilização sem cookies registam o tamanho do ficheiro e o número de elementos, nunca o conteúdo, e podem ser desligadas. Uma ligação de partilha, se a criar, contém a pontuação, o nome do ficheiro e até 50 problemas com nomes de elementos.',
          ],
        },
        { kind: 'shot', label: 'O resultado', h2: 'Experimente com um modelo de exemplo', sub: 'A demonstração abaixo corre nesta página. Depois abra o seu próprio ficheiro.' },
        {
          kind: 'text', label: 'Preço', h2: 'Quanto custa',
          ps: [
            'Nada: o visualizador, as regras, o IDS e as exportações são gratuitos e não precisam de conta. O código é público sob a licença MIT no [GitHub](github).',
            'Os planos pagos que acrescentam um servidor (modelos guardados, conjuntos de regras guardados, trabalho em equipa) estão descritos na [página de preços](pricing) e ainda não estão à venda.',
          ],
        },
      ],
      faq: [
        ['Isto é um serviço na nuvem?', 'É disponibilizado a partir da web como se fosse, mas a verificação é feita pelo seu navegador. Não há carregamento, não há fila de espera e não fica nenhuma cópia do modelo guardada do nosso lado.'],
        ['Como posso confirmar que nada é carregado?', 'Abra as ferramentas de programador do seu navegador, vá ao separador Network e largue um ficheiro IFC. Verá carregar os ficheiros da própria página e nenhum pedido a transportar o modelo.'],
        ['Que tamanho de ficheiro aguenta?', 'Os ficheiros de 2 GB ou mais são recusados, e o limite prático depende da memória do computador: aparece um aviso a partir de 1 GB, ou a partir de 80 MB em telemóveis e máquinas com 4 GB de memória ou menos. O Solibri WebChecker aceita até 5 GB por ficheiro (solibri.com/solutions/webchecker, consultado em 2026-11-10).'],
        ['Posso automatizá-lo?', 'A partir desta página, não: cada ficheiro é aberto por uma pessoa. Existe um servidor MCP (ifc-viewer-mcp) que corre a mesma validação na sua própria máquina a partir de um assistente ou de um script; veja o [código no GitHub](github).'],
        ['É permitido para modelos confidenciais?', 'O modelo fica no seu computador, que é normalmente o que um acordo de confidencialidade (NDA) exige. Confirme duas coisas face à sua própria política: as estatísticas de utilização anónimas (podem ser desligadas) e as ligações de partilha (contêm nomes de ficheiros e de elementos).'],
      ],
      faqSources: ['solibriWebchecker'],
      bottom: ['Verifique um ficheiro sem o carregar', 'Grátis, sem conta. O modelo fica no seu computador.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    onprem: {
      title: 'Validador IFC On-Premise — Validação BIM em Rede Isolada',
      desc: 'Visualizador IFC, validador de 44 regras e verificações IDS servidos na sua rede, sem internet. Imagem de contentor, instalação, formação e suporte.',
      nav: 'Validação IFC on-premise',
      kicker: 'On-premise · Sem ligação à internet · O seu servidor',
      h1: ['Validador IFC on-premise', 'para redes que se mantêm fechadas'],
      lead: 'A aplicação pública já lê os ficheiros IFC dentro do navegador, mas a própria página é carregada a partir da internet. Onde isso não é permitido, o mesmo visualizador, o mesmo validador e as mesmas verificações IDS são servidos a partir de um contentor no seu próprio servidor.',
      cta: 'Pedir um piloto',
      cta2: '',
      note: 'Um local, âmbito fixo: instalação, configuração com os seus requisitos, uma sessão de formação e um período de suporte.',
      shots: [
        { alt: 'Validador IFC com a lista de perfis de validação incluídos aberta: entrega básica, revisão de qualidade, coordenação BIM, conformidade ISO 19650 e projeto LOD 300', cap: 'Os perfis incluídos. Durante o piloto, os seus próprios perfis e ficheiros IDS são carregados e testados nos seus modelos.' },
        { alt: 'Resultado de uma verificação IDS no validador IFC: uma especificação falhada, 0 de 57 paredes com a propriedade FireRating, com botões para realçar, isolar e exportar', cap: 'Um modelo verificado face a um ficheiro IDS: as 57 paredes falham o requisito de resistência ao fogo. Em on-premise, o modelo e os requisitos ficam na sua rede.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'Para quem é', h2: 'Quando "nada é carregado" não chega',
          cols: [
            { h: 'Adequa-se quando', items: [
              'Os postos de trabalho não têm acesso à internet, ou não podem carregar software a partir dela.',
              'Precisa de uma versão auditada que não muda até que o decida.',
              'Os modelos dos empreiteiros têm de ser verificados face ao seu IDS ou EIR sem passarem por terceiros.',
              'Quer ter alguém a quem ligar quando não funciona.',
            ] },
            { h: 'Não precisa disto quando', items: [
              'A sua política só proíbe carregar modelos para fora. O [validador público](validator) não os carrega.',
              'Tem pessoal para o alojar por conta própria. O código tem licença MIT e inclui um Dockerfile: construa a imagem e sirva-a. O piloto acrescenta configuração, formação e suporte, não um produto diferente.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'O que recebe', h2: 'O que é instalado, e o que não é',
          head: ['', 'Detalhe'],
          rows: [
            ['Software', 'O visualizador, as 44 regras com o Health Score, IDS 1.0, BCF 2.1 e 3.0, vários modelos em simultâneo, medições e cortes. Uma aplicação web estática servida por nginx a partir de um contentor; a verificação corre no navegador de cada utilizador.'],
            ['Servidor', 'Qualquer máquina que corra um contentor. Só serve ficheiros, por isso precisa de pouco: o trabalho é feito pelos postos de trabalho.'],
            ['Ligações', 'Nenhuma ligação de saída e nenhuma estatística de utilização nesta versão.'],
            ['Não disponível offline', 'O contexto de mapa 3D (terreno, edifícios do OpenStreetMap) e os modelos de exemplo online, porque são descarregados da internet.'],
            ['Os seus requisitos', 'Os seus ficheiros IDS, perfis de validação e padrões de nomenclatura carregados e testados nos seus próprios modelos.'],
            ['Atualizações', 'Um novo ficheiro de imagem, entregue pelo canal que escolher. Nada se atualiza sozinho.'],
            ['Hardware', 'O seu próprio servidor ou máquina virtual. Pode ser fornecido um gateway pré-configurado, a pedido.'],
          ],
        },
        {
          kind: 'table', label: 'Alternativas', h2: 'A outra opção para redes isoladas que conhecemos',
          sub: 'Se está a comparar, isto é o que a Solibri publica sobre o seu plano offline.',
          head: ['', 'Solibri Security+', 'IFC Viewer Online on-premise'],
          rows: [
            ['Descrito como', '"Fully offline operation (no telemetry)", "Air-gapped by design", "Controlled update cycles"', 'Um contentor no seu servidor; nenhuma ligação de saída'],
            ['Preço', 'Não publicado; "Talk with an expert"', 'Orçamentado por piloto, depois de uma chamada de definição do âmbito'],
            ['Verificações', 'A validação baseada em regras da Solibri', '44 regras fixas e IDS 1.0; colisões apenas por caixa envolvente'],
          ],
          after: [
            'O Solibri é a escolha mais forte quando precisa de deteção de colisões entre especialidades ou de regras escritas para a sua organização. Esta instalação é a coisa mais pequena: abrir uma entrega, verificá-la face aos seus requisitos e devolver os resultados.',
          ],
          sources: ['solibriPricing'],
        },
        {
          kind: 'steps', label: 'Piloto', h2: 'Como funciona um piloto',
          steps: [
            ['Chamada de definição do âmbito', 'As regras da sua rede, o tamanho dos seus modelos, os seus requisitos e quem o vai usar.'],
            ['Instalação', 'No seu servidor, com os seus ficheiros IDS e perfis carregados.'],
            ['Formação', 'Uma sessão com os seus coordenadores BIM, nos seus próprios modelos.'],
            ['Decisão', 'Depois do período de suporte, decide se o alarga a outros locais.'],
          ],
        },
        {
          kind: 'form', label: 'Pedir um piloto', h2: 'Fale-nos do seu ambiente',
          sub: 'O formulário abre uma mensagem no seu próprio programa de correio eletrónico. Nada é enviado para os nossos servidores.',
          org: 'Organização', sector: 'Setor',
          sectors: ['Defesa / segurança', 'Energia / serviços públicos', 'Transportes / infraestruturas', 'Administração pública', 'Indústria / fabrico', 'Empresa de AEC', 'Outro'],
          deploy: 'Rede', deploys: ['Sem qualquer acesso à internet', 'Rede privada, internet restrita', 'Nuvem privada na nossa região', 'Ainda não sabemos'],
          hw: 'Hardware', hws: ['O nosso próprio servidor ou máquina virtual', 'Um gateway pré-configurado', 'Ainda não sabemos'],
          need: 'O que precisa de verificar, e que tamanho têm aproximadamente os modelos?',
          submit: 'Abrir o email', direct: 'Ou escreva para', subject: 'Piloto de validação IFC on-premise',
        },
      ],
      faq: [
        ['Sai alguma coisa da nossa rede?', 'Não. O contentor serve a aplicação aos vossos navegadores e não faz nenhuma ligação de saída; esta versão não tem estatísticas de utilização. Os modelos são lidos no navegador de cada utilizador e não são guardados no servidor.'],
        ['O que é diferente da aplicação pública?', 'O programa é o mesmo. O que muda é o sítio a partir de onde é servido, o facto de ser uma versão fixa, e que as funcionalidades que precisam da internet (o contexto de mapa e os modelos de exemplo online) não estão disponíveis.'],
        ['Podemos alojá-lo nós mesmos, sem vocês?', 'Sim. O código-fonte é público sob a licença MIT e inclui um Dockerfile e uma configuração de nginx. O piloto é para equipas que o querem configurado, explicado e com suporte.'],
        ['Que tamanho podem ter os modelos?', 'O mesmo que na aplicação pública: menos de 2 GB por ficheiro, limitado na prática pela memória de cada posto de trabalho, porque a verificação corre no navegador.'],
        ['Quanto custa?', 'Um piloto é orçamentado depois da chamada de definição do âmbito, porque depende do número de locais e do suporte de que precisa. Ainda não há uma tabela de preços pública para isto.'],
      ],
      bottom: ['A sua rede está ligada à internet? Então já é grátis', 'O validador público lê o ficheiro no seu navegador e não carrega nada.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    solibri: {
      title: 'Alternativa ao Solibri Grátis — Validar IFC no Navegador',
      desc: 'Quando basta um validador grátis no navegador e quando precisa do Solibri: preços, colisões, regras e IDS segundo as páginas da Solibri lidas em 2026-11-10.',
      nav: 'Alternativa ao Solibri',
      kicker: 'Grátis · No navegador · Comparado com os planos publicados pela Solibri',
      h1: ['Alternativa ao Solibri gratuita', 'para verificar um IFC antes de ser entregue'],
      lead: 'O Solibri é uma plataforma de verificação baseada em regras, vendida em planos de 99 € a 2.772 € por licença por ano. O IFC Viewer Online é uma página web gratuita que abre um IFC, corre 44 regras fixas e o seu IDS, e mostra o que falha. Substitui o Solibri em alguns trabalhos e noutros não; esta página diz quais.',
      cta: 'Validar um ficheiro IFC',
      cta2: 'ou abrir o modelo de exemplo',
      note: 'Sem conta, sem nada para instalar, e o ficheiro não é carregado.',
      heroSources: ['solibriPricing'],
      shots: [
        { alt: 'Modelo IFC verificado no navegador com a regra de colisões ativada: Health Score 70, 36 colisões entre elementos em primeiro lugar na lista de correções, e os elementos envolvidos realçados na vista 3D', cap: 'O modelo de exemplo com a regra de colisões ativada: 36 sobreposições entre caixas envolventes, e a pontuação desce de 77 para 70. É um primeiro filtro dentro de um só modelo, não a deteção de colisões que a Solibri vende.' },
        { alt: 'Verificação IDS no navegador: uma especificação IDS que exige uma resistência ao fogo nas paredes, falhada pelas 57 paredes do modelo IFC mostrado em 3D', cap: 'Um ficheiro IDS 1.0 verificado face ao modelo, grátis e sem conta: 57 paredes não têm a resistência ao fogo que a especificação pede.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Comparação', h2: 'Solibri e IFC Viewer Online, lado a lado',
          sub: 'A coluna do Solibri diz apenas o que a Solibri publica. Quando as suas páginas não indicam algo (sistemas operativos, limites de tamanho de ficheiro), não há linha.',
          head: ['', 'Solibri', 'IFC Viewer Online'],
          rows: [
            ['Preço', 'Starter 99 €, Essential 1.428 €, Advanced 2.109 €, Premium 2.772 €: preços iniciais por licença por ano. Security+ sob consulta', 'Grátis. Os planos pagos para funcionalidades de servidor ainda não estão à venda'],
            ['Verificação de modelos', 'A partir do Essential. O Starter serve para ver modelos e rever resultados: "Model checking is performed in Solibri Essential, Advanced, or Premium"', 'Incluída: 44 regras fixas, 25 ativas por omissão'],
            ['Deteção de colisões', 'Essential: verificação de colisões baseada em regras, colisões duras (hard) e suaves (soft). Advanced: uma matriz de colisões entre especialidades com tolerâncias', 'Apenas caixas envolventes, dentro de um só modelo, sobreposição de 5 cm, até 800 elementos e 100 resultados. Desligada por omissão'],
            ['As suas próprias regras', 'Advanced e Premium: "Custom rule creation and modification"', 'Sem editor de regras. Pode ativar e desativar regras, alterar a sua gravidade e definir padrões de nomenclatura e conjuntos de propriedades obrigatórios; tudo o resto entra como IDS'],
            ['IDS', 'O Essential verifica as propriedades obrigatórias face a definições IDS. O Advanced acrescenta fluxos de trabalho IDS, um editor de IDS e um validador de IDS', 'IDS 1.0 com as suas seis facetas. Três restrições (totalDigits, fractionDigits, whiteSpace) não são lidas'],
            ['BCF', 'A partir do Essential: "BCF issue management and CDE integrations"', 'Lê e escreve ficheiros BCF 2.1 e 3.0. Sem ligação a um servidor BCF nem a um CDE'],
            ['Modelos nativos do Revit', 'A partir do Essential: "IFC and native Revit model federation"', 'Apenas IFC'],
            ['Extração de quantidades', 'Advanced: "Quantity / Information Takeoff (QTO / ITO)"', 'Soma as quantidades já escritas no IFC. Sem regras de extração'],
            ['Sem internet', 'Security+: "Fully offline operation (no telemetry)"', 'A página é carregada a partir da internet; o ficheiro não é carregado para nenhum servidor. Existe uma [instalação on-premise](onprem)'],
          ],
          after: [
            'Escolha o Solibri quando coordena várias especialidades e precisa de verdadeira deteção de colisões, quando a sua organização escreve as suas próprias regras, ou quando a verificação tem de ser governada em muitos projetos. Nada nesta página faz isso.',
            'Escolha o IFC Viewer Online quando quer saber hoje se um IFC está em condições de ser enviado: identificadores, estrutura, nomes, propriedades, o seu IDS. É também a ferramenta para as pessoas à volta de uma equipa Solibri que não têm licença: o arquiteto que exporta o modelo, o cliente que o recebe.',
            'Muitas equipas vão usar os dois: uma verificação rápida no navegador antes da exportação, e o Solibri para a coordenação.',
          ],
          sources: ['solibriPricing', 'solibriStarter', 'solibriEssential', 'solibriAdvanced'],
        },
        {
          kind: 'text', label: 'O Solibri hoje', h2: 'Se procura o Solibri Office ou o Solibri Anywhere',
          ps: [
            'O site da Solibri lista o Solibri Office, o CheckPoint, o Anywhere e o Site como produtos antigos (legacy) que estão "no longer available for new customers". Os planos atuais são Starter, Essential, Advanced, Premium e Security+.',
            'A versão gratuita do Solibri Anywhere continua a funcionar para quem já a tem, em versões anteriores à 26.4.0; a Solibri diz que o direito de utilização gratuito não está disponível nas versões mais recentes. Se usava o Anywhere para abrir e ver ficheiros IFC, o [visualizador](viewer) faz isso gratuitamente, no navegador, em qualquer sistema operativo.',
          ],
          sources: ['solibriLegacy', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Âmbito', h2: 'O que tem aqui, e o que não tem',
          cols: [
            { h: 'Tem', items: [
              'Um Health Score de 0 a 100 e as correções que recuperam mais pontos.',
              'Os elementos que falham realçados no modelo 3D, e listados por regra, piso ou classe.',
              'Verificações IDS 1.0 e cinco perfis de validação incluídos, da entrega básica à ISO 19650 e ao LOD 300.',
              'Correções automáticas de GlobalIds e nomes, edição manual de nomes e valores de propriedades, e o IFC corrigido.',
              'Resultados em BCF 2.1, CSV, JSON, um relatório HTML ou uma folha de cálculo COBie.',
            ] },
            { h: 'Não tem', items: [
              'Deteção de colisões entre modelos, nem ao nível da geometria real.',
              'Um editor de regras, verificação regulamentar (acessibilidade, incêndio, caminhos de evacuação) nem análise de espaços.',
              'Gestão de problemas com atribuições num servidor. Os ficheiros BCF são trocados à mão.',
              'Ficheiros de 2 GB ou mais. O limite depende da memória do seu computador.',
            ] },
          ],
        },
        { kind: 'shot', label: 'Experimente', h2: 'Corra-o num modelo de exemplo', sub: 'A demonstração abaixo carrega o validador nesta página.' },
        {
          kind: 'text', label: 'Preço', h2: 'Quanto custa',
          ps: [
            'O visualizador, as regras, o IDS, as correções e as exportações são gratuitos, sem conta, também para projetos comerciais. O código-fonte é público sob a licença MIT no [GitHub](github).',
            'Os planos pagos (Pro a 19 € por mês, Team a 35 € por editor por mês) vão acrescentar o que precisa de um servidor; ainda não estão à venda. Veja a [página de preços](pricing).',
          ],
        },
      ],
      faq: [
        ['O IFC Viewer Online substitui o Solibri?', 'Para verificar um IFC antes da entrega (identificadores, estrutura espacial, nomes, propriedades, IDS), sim. Para deteção de colisões entre especialidades, regras personalizadas e governação entre projetos, não: é para isso que servem o Solibri Essential e o Advanced.'],
        ['Quanto custa o Solibri?', 'A Solibri publica preços iniciais por licença por ano: Starter 99 €, Essential 1.428 €, Advanced 2.109 € e Premium 2.772 €. O Security+ tem preço sob consulta (solibri.com/pricing, consultado em 2026-11-10).'],
        ['Existe uma versão gratuita do Solibri?', 'O Solibri Anywhere, que tinha uma versão gratuita, é agora um produto antigo (legacy) e não está disponível para novos clientes; os utilizadores gratuitos existentes podem manter versões anteriores à 26.4.0 (solibri.com/products/legacy-products, consultado em 2026-11-10). O plano atual mais barato é o Starter, a 99 € por ano.'],
        ['O plano Starter de 99 € verifica modelos?', 'Segundo a Solibri, o Starter serve para inspeção visual e para rever resultados feitos por outros: "Model checking is performed in Solibri Essential, Advanced, or Premium" (solibri.com/products/starter, consultado em 2026-11-10).'],
        ['O que faz o Solibri que isto não consegue fazer?', 'Deteção de colisões sobre a geometria real e entre modelos, regras escritas para a sua organização, regras de extração de quantidades, modelos nativos do Revit, servidores BCF e ligações a CDE, e um plano totalmente offline. Veja a tabela acima.'],
        ['Posso usar os dois?', 'Sim, e é uma divisão comum: os autores e os clientes verificam um ficheiro no navegador antes de o enviarem, e a equipa de coordenação corre o Solibri sobre o modelo federado.'],
      ],
      faqSources: ['solibriPricing', 'solibriLegacy', 'solibriStarter'],
      bottom: ['Verifique um ficheiro antes de decidir', 'Demora um minuto, não custa nada e o modelo fica no seu computador.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    webchecker: {
      title: 'Alternativa ao Solibri WebChecker — Verificador IFC Grátis',
      desc: 'O Solibri WebChecker exige um plano Advanced ou Premium e carrega o IFC. Esta alternativa grátis verifica-o no navegador. O que faz cada um, com fontes.',
      nav: 'Alternativa ao Solibri WebChecker',
      kicker: 'Grátis · Sem plano Solibri · O ficheiro não é carregado',
      h1: ['Alternativa ao Solibri WebChecker', 'que verifica o IFC no seu próprio navegador'],
      lead: 'O Solibri WebChecker (Beta) corre o motor de verificação da Solibri online: carrega um IFC, este é verificado no serviço da Solibri, e descarrega um PDF ou um BCF. Vem com os planos Advanced e Premium. Se precisa de uma verificação na web sem plano, ou sem carregar o modelo, esta página fá-la no seu navegador, com menos verificações.',
      cta: 'Validar um ficheiro IFC',
      cta2: 'ou abrir o modelo de exemplo',
      note: 'Sem conta e sem tokens. Até 2 GB por ficheiro.',
      heroSources: ['solibriWebchecker'],
      shots: [
        { alt: 'Verificação IFC na web: a lista de problemas agrupados por regra com o número de elementos que falham, no painel de validação do visualizador no navegador', cap: 'Os resultados de uma verificação, agrupados por regra. Nada foi carregado para os produzir.' },
        { alt: 'Exportação de uma verificação IFC a partir do navegador com os formatos BCF, CSV, JSON, relatório de entrega e COBie', cap: 'Os resultados saem em BCF 2.1, CSV, JSON, um relatório HTML ou uma folha de cálculo COBie. Não há ficheiro PDF; o relatório HTML imprime-se a partir do navegador.' },
      ],
      sections: [
        {
          kind: 'table', label: 'Comparação', h2: 'Solibri WebChecker e IFC Viewer Online',
          sub: 'A coluna do WebChecker foi retirada da página da própria Solibri.',
          head: ['', 'Solibri WebChecker (Beta)', 'IFC Viewer Online'],
          rows: [
            ['Acesso', 'Incluído no Solibri Advanced (a partir de 2.109 € por ano) e no Premium (a partir de 2.772 €). Não está no Starter, no Essential nem no Security+, e "not a standalone product". Precisa de um Solibri ID', 'Abra a página. Sem conta'],
            ['Custo por verificação', '50 tokens. O Advanced inclui 1.750 tokens por ano (cerca de 35 verificações), o Premium 17.500 (cerca de 350). Tokens adicionais: 5.000 por 250 €, 10.000 por 450 €, 25.000 por 750 €', 'Grátis, qualquer número de verificações'],
            ['Para onde vai o modelo', 'É carregado. Residência dos dados na UE ou nos EUA, escolhida na configuração do projeto', 'Fica no separador do seu navegador'],
            ['Conservação dos resultados', '30 dias', 'Até fechar o separador; exporte o que precisar'],
            ['Tamanho do ficheiro', 'Até 5 GB por ficheiro IFC', 'Menos de 2 GB, e menos ainda num computador com pouca memória'],
            ['Verificações', 'Verificação Model Health (estrutura e classificação, nomenclatura e identificadores, propriedades-chave através de verificações baseadas em IDS, colisões geométricas duras entre especialidades), ou um conjunto de regras .cset personalizado feito na aplicação de secretária', '44 regras fixas e ficheiros IDS 1.0. Colisões apenas por caixa envolvente dentro de um só modelo'],
            ['Resultados', 'PDF e BCF (1.0, 2.0, 2.1 ou 3.0); ficheiros SMC para utilizadores Premium', 'BCF 2.1, CSV, JSON, relatório HTML, folha de cálculo COBie'],
          ],
          after: [
            'O WebChecker é a melhor ferramenta quando a sua equipa BIM já mantém conjuntos de regras do Solibri e quer que os participantes do projeto corram exatamente esses, quando os ficheiros têm mais de 2 GB, ou quando precisa de colisões duras entre especialidades no relatório.',
            'Esta página é a melhor ferramenta quando não tem um plano Advanced ou Premium, quando o modelo não pode ser carregado, ou quando verifica com frequência e não quer contar tokens.',
          ],
          sources: ['solibriWebchecker', 'solibriPricing'],
        },
        {
          kind: 'cols', label: 'Âmbito', h2: 'O que esta verificação cobre, e o que não cobre',
          cols: [
            { h: 'Verifica', items: [
              'Identificadores, estrutura espacial, pisos, nomes, valores de propriedades, tipos e materiais: 44 regras, 25 ativas por omissão.',
              'Ficheiros IDS 1.0 com as suas seis facetas.',
              'Cinco perfis de validação incluídos, ou os seus próprios padrões de nomenclatura e conjuntos de propriedades obrigatórios.',
            ] },
            { h: 'Não verifica', items: [
              'Conjuntos de regras do Solibri. Um ficheiro .cset não pode ser carregado aqui.',
              'Colisões duras entre especialidades, regras de acessibilidade nem análise de espaços.',
              'Ficheiros de 2 GB ou mais.',
            ] },
          ],
          sources: ['solibriWebchecker'],
        },
        {
          kind: 'text', label: 'O seu ficheiro', h2: 'O que acontece ao ficheiro',
          ps: [
            'O IFC é lido por código que corre no separador do seu navegador e não é carregado. O navegador guarda uma cópia convertida da geometria no seu armazenamento privado, no seu computador (até 4 GB), para o reabrir mais depressa; limpar os dados do site remove-a.',
            'As estatísticas de utilização sem cookies registam o tamanho do ficheiro e o número de elementos, nunca o conteúdo, e podem ser desligadas. Uma ligação de partilha, se a criar, transporta a pontuação, o nome do ficheiro e até 50 problemas dentro do URL.',
          ],
        },
        { kind: 'shot', label: 'Experimente', h2: 'Corra uma verificação num modelo de exemplo', sub: 'A demonstração abaixo carrega o validador nesta página.' },
        {
          kind: 'text', label: 'Preço', h2: 'Quanto custa',
          ps: [
            'Nada, e não há tokens. O visualizador, as regras, o IDS e as exportações são gratuitos e sem conta. O código é público sob a licença MIT no [GitHub](github).',
            'Os planos pagos que acrescentam um servidor estão descritos na [página de preços](pricing) e ainda não estão à venda. Os outros planos e preços são comparados [numa página à parte](solibri).',
          ],
        },
      ],
      faq: [
        ['O que é o Solibri WebChecker?', 'Nas palavras da Solibri, "a browser-based model validation service that runs Solibri\'s rules-based checking engine online". Os utilizadores carregam modelos IFC, correm a verificação Model Health ou um conjunto de regras personalizado, e exportam PDF ou BCF (solibri.com/solutions/webchecker, consultado em 2026-11-10).'],
        ['O Solibri WebChecker é gratuito?', 'Não. Está incluído no Solibri Advanced e no Premium e não é vendido em separado. Cada verificação gasta 50 tokens da dotação anual do plano ou de pacotes de tokens que começam em 250 € por 5.000 tokens (solibri.com/solutions/webchecker, consultado em 2026-11-10).'],
        ['O WebChecker carrega o meu modelo?', 'Sim: a Solibri descreve-o como um serviço em que os utilizadores carregam modelos IFC, com os dados guardados na UE ou nos EUA e os resultados conservados durante 30 dias (solibri.com/solutions/webchecker, consultado em 2026-11-10). O IFC Viewer Online, em vez disso, lê o ficheiro no seu navegador.'],
        ['Posso correr aqui os meus conjuntos de regras do Solibri?', 'Não. Os conjuntos de regras do Solibri (.cset) só correm no Solibri. Os requisitos que possam ser escritos como IDS 1.0 podem ser verificados aqui.'],
        ['Qual dos dois encontra mais problemas?', 'Procuram coisas diferentes. A verificação Model Health do WebChecker inclui colisões duras entre especialidades, o que esta página não faz. Esta página dá uma pontuação e correções automáticas de identificadores e nomes. Para coordenação, use o Solibri.'],
      ],
      faqSources: ['solibriWebchecker'],
      bottom: ['Corra uma verificação na web agora', 'Sem plano, sem tokens, sem carregamento.'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    mac: {
      title: 'Visualizador IFC para Mac — Grátis, Sem Instalar, no Safari',
      desc: 'Abra ficheiros IFC num Mac no Safari, Chrome ou Firefox: vista 3D, propriedades, cortes, medições e validação. Nada para instalar, sem conta, grátis.',
      nav: 'Visualizador IFC para Mac',
      kicker: 'macOS · Safari, Chrome, Firefox, Edge · Nada para instalar · Grátis',
      h1: ['Visualizador IFC para Mac', 'que corre no navegador que já tem'],
      lead: 'Não há aplicação para descarregar: o visualizador é uma página web. Abra-a no Safari ou no Chrome em macOS, largue um ficheiro IFC e tem o modelo 3D, a árvore espacial, as propriedades de cada elemento, cortes, medições e um relatório de validação. O ficheiro não é carregado para nenhum servidor.',
      cta: 'Abrir o visualizador',
      cta2: 'ou abrir o modelo de exemplo',
      note: 'Sem conta. IFC2x3, IFC4, IFC4x1 e IFC4x3, até 2 GB por ficheiro.',
      shots: [
        { alt: 'Visualizador IFC numa janela de navegador de 1440 por 900, o tamanho de um ecrã de MacBook: uma moradia de dois pisos em 3D, a árvore espacial à esquerda e os atributos IFC e conjuntos de propriedades de uma parede selecionada à direita', cap: 'O visualizador numa janela de 1440 × 900, o tamanho por omissão do ecrã de um MacBook Air (capturado no Chrome). À direita, os atributos e os conjuntos de propriedades da parede selecionada.' },
        { alt: 'Plano de corte a cortar um modelo IFC de uma moradia no visualizador do navegador, com o mobiliário interior visível, numa janela de 1440 por 900', cap: 'Um plano de corte através do mesmo modelo, movido com o cursor deslizante ou arrastando-o na vista. Não é preciso nenhum plug-in.' },
      ],
      sections: [
        {
          kind: 'cols', label: 'Num Mac', h2: 'O que funciona em macOS, e o que esperar',
          cols: [
            { h: 'Funciona', items: [
              'No Safari, Chrome, Firefox e Edge em macOS. A página precisa de WebGL e WebAssembly, que esses navegadores incluem.',
              'Abrir ficheiros .ifc e arquivos .ifczip ou .zip, arrastando-os para a janela ou com o botão Open.',
              'Vários modelos em simultâneo, cada um com a sua árvore e as suas propriedades.',
              'Também num iPad ou iPhone, com ficheiros mais pequenos.',
            ] },
            { h: 'Tenha em conta', items: [
              'Não é uma aplicação de macOS: não tem ícone na Dock, não tem pré-visualização no Quick Look, e os ficheiros .ifc não abrem com duplo clique.',
              'A página tem de ser carregada a partir da internet. Não funciona offline.',
              'O limite de tamanho de ficheiro é de 2 GB e, na prática, a memória do Mac: aparece um aviso a partir de 1 GB, ou a partir de 80 MB em máquinas com 4 GB de memória ou menos e em iPad e iPhone.',
              'As capturas desta página foram feitas no Chrome. Se algo parecer errado no Safari, experimente o Chrome.',
            ] },
          ],
        },
        {
          kind: 'cols', label: 'Ferramentas', h2: 'O que pode fazer com um modelo',
          cols: [
            { h: 'Ver', items: [
              'Orbitar, deslocar e fazer zoom; ocultar e isolar elementos; percorrer a árvore espacial.',
              'Planos de corte e plantas 2D cortadas a partir do modelo, exportadas em DXF, SVG ou PDF.',
              'Medir distâncias, áreas, ângulos e folgas.',
              'Ler todos os conjuntos de propriedades e as quantidades escritas no ficheiro.',
            ] },
            { h: 'Verificar e corrigir', items: [
              'Uma validação com 44 regras e um Health Score de 0 a 100; veja o [validador IFC](validator).',
              'Verificações IDS 1.0 face aos seus próprios requisitos.',
              'Editar nomes e valores de propriedades, corrigir GlobalIds e exportar o IFC corrigido ou um GLB.',
              'Abrir e escrever ficheiros BCF 2.1 e 3.0.',
            ] },
          ],
        },
        {
          kind: 'table', label: 'Comparação', h2: 'Outras formas de abrir um IFC num Mac',
          sub: 'O Flinker é o outro visualizador gratuito no navegador sobre o qual nos perguntam. A coluna dele diz o que a Flinker publica.',
          head: ['', 'Flinker', 'IFC Viewer Online'],
          rows: [
            ['O que é', '"The IFC viewer for Microsoft": SharePoint, Teams, Excel, Power BI, Windows e o navegador', 'Um visualizador, validador e editor numa página web'],
            ['Num Mac', 'O visualizador no navegador. A aplicação de secretária é para Windows; o site não menciona o macOS', 'Qualquer navegador atual em macOS'],
            ['Para começar', '"Open a model without creating an account"', 'Sem conta'],
            ['Formatos', 'IFC 2x3, 4 e 4x3; BCF 2.1 e 3.0; IDS 1.0; DXF; sobreposição de PDF', 'IFC2x3, IFC4, IFC4x1 e IFC4x3; BCF 2.1 e 3.0; IDS 1.0'],
            ['O ficheiro', 'Processado no navegador; fica no dispositivo ou no armazenamento Microsoft que escolher', 'Lido no navegador; não é carregado'],
            ['Verificação', 'Verificações de requisitos IDS com realce do que passa e do que falha', '44 regras com um Health Score, mais IDS'],
            ['Preço', 'Community: grátis. Enterprise: preço por implementação', 'Grátis'],
          ],
          after: [
            'Escolha o Flinker quando os seus projetos já vivem no SharePoint e no Teams: abrir o modelo ao lado dos documentos é aquilo para que foi feito, e este visualizador não se liga ao Microsoft 365.',
            'Escolha o IFC Viewer Online quando também quer saber se o modelo está bom: a validação, a pontuação e as correções são a diferença.',
            'Sobre o Solibri: as páginas de produto que lemos no mesmo dia não indicam em que sistemas operativos correm os seus planos, por isso não o dizemos. Confirme os requisitos de sistema do Solibri antes de comprar para um Mac.',
          ],
          sources: ['flinkerViewer', 'solibriPricing'],
        },
        { kind: 'shot', label: 'Experimente', h2: 'Abra o modelo de exemplo', sub: 'A demonstração abaixo corre nesta página, no navegador que está a usar agora.' },
        {
          kind: 'text', label: 'Preço', h2: 'Quanto custa',
          ps: [
            'Nada. Não há licença, não há período de teste e não há conta. O código é público sob a licença MIT no [GitHub](github). Os planos pagos que acrescentam um servidor estão na [página de preços](pricing) e ainda não estão à venda.',
          ],
        },
      ],
      faq: [
        ['Existe um visualizador IFC para Mac que não precise de instalação?', 'Sim: este é uma página web. Abra-a no Safari, Chrome, Firefox ou Edge em macOS e largue o ficheiro. Não há nada para descarregar nem instalar.'],
        ['Funciona no Safari?', 'Sim. Precisa de WebGL e WebAssembly, que as versões atuais do Safari incluem. As capturas desta página foram feitas no Chrome, por isso experimente o Chrome se um modelo não for bem apresentado.'],
        ['O IFC é carregado para um servidor quando o abro?', 'Não. O ficheiro é lido por código que corre no separador do navegador. Só as estatísticas de utilização anónimas (tamanho do ficheiro e número de elementos) saem do navegador, e podem ser desligadas.'],
        ['Posso abrir ficheiros do Revit ou do Archicad?', 'Não, apenas IFC. Exporte primeiro um IFC a partir do software de modelação.'],
        ['Funciona offline num Mac?', 'Não. A página tem de ser carregada a partir da internet de cada vez, embora o modelo em si nunca seja enviado.'],
        ['O Flinker está disponível para Mac?', 'O visualizador do Flinker corre no navegador, por isso pode ser usado num Mac dessa forma; a sua aplicação de secretária é publicada para Windows e o site não menciona o macOS (flinker.app/products/ifc-viewer, consultado em 2026-11-10).'],
      ],
      faqSources: ['flinkerViewer'],
      bottom: ['Abra um IFC no seu Mac', 'No navegador, grátis, sem nada para instalar.'],
    },
  },
}
