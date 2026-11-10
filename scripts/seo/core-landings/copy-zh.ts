import type { LangCopy } from './types'

// Simplified Chinese copy for the six landing families. Same structure as
// copy-en.ts; see TRANSLATING.md.

export const copy: LangCopy = {
  ui: {
    home: 'IFC Viewer Online',
    sources: '来源',
    readOn: '查阅于',
    faqLabel: '常见问题',
    faqTitle: '问题',
    related: '相关页面',
    fix: '修复 IFC 错误',
    blogSolibri: 'Solibri 还是浏览器验证器：详细对比',
    pricing: '价格',
    embedCta: '在示例 IFC 上运行验证',
    embedSub: '在本页面中加载验证器。不会上传任何内容。',
  },
  pages: {
    // ─────────────────────────────────────────────────────────────────────────
    validator: {
      title: '在线 IFC 验证 — 免费 IFC 验证器，44 条规则，无需上传',
      desc: '在浏览器中检查 IFC 文件：44 条规则、IDS 1.0，以及 0 到 100 的 Health Score。文件不会上传。免费，无需账号。支持 IFC2x3、IFC4、IFC4x3。',
      nav: 'IFC 验证器',
      kicker: '44 条规则 · IDS 1.0 · 文件留在您的浏览器中 · 免费',
      h1: ['在线 IFC 验证', '文件哪里有问题，问题在哪个构件上'],
      lead: '拖入一个 IFC 文件，即可得到 0 到 100 的 Health Score、按规则分组的问题列表，以及在 3D 模型中高亮显示的不合格构件。文件在您的浏览器标签页中读取，不会上传。',
      cta: '验证 IFC 文件',
      cta2: '或打开示例模型',
      note: '无需账号。支持 IFC2x3、IFC4、IFC4x1 和 IFC4x3，单个文件最大 2 GB。',
      shots: [
        { alt: '在浏览器中对一栋两层住宅进行 IFC 验证：Health Score 77，一个错误和 161 个警告，能挽回最多分数的三项修复，3D 视图逐个定位 119 个没有类型的构件', cap: '公开的 Duplex 示例（2.3 MB，7,181 个实体）得分为 77。点击第一项修复上的“Show in 3D”，视图会对准 119 个没有类型的构件，并显示一个计数器，可以逐个查看。' },
        { alt: '按规则分组的 IFC 验证问题列表，显示每条规则下不合格构件的数量以及修复方法的说明', cap: '展开每条规则，可以看到对应的构件，以及在 Revit、Archicad 或 Tekla 中修复它的步骤。' },
      ],
      sections: [
        {
          kind: 'cols', label: '范围', h2: '检查涵盖什么，不涵盖什么',
          sub: '共有 44 条规则，分为八组。25 条默认运行；另外 19 条需要在验证配置中开启，因为它们需要您先做出决定（LOD 等级、命名规则、分类体系）。',
          cols: [
            { h: '会检查', items: [
              '标识符：重复的 GlobalId，以及不是有效的 22 位 IFC GUID 的 GlobalId。',
              '结构：只有一个 IfcProject，Project → Site → Building → Storey 层级链，没有归属楼层的构件，断开或循环的聚合关系，没有宿主的洞口。',
              '楼层：标高缺失、重复或顺序错误。',
              '数据：名称为空、名称重复、属性值为空、构件没有类型或材质、空间没有楼面面积。',
              '导出质量：超过 5% 的构件为 IfcBuildingElementProxy，模型距原点超过 10 km，平均每个构件超过 500 KB，长度单位为英制。',
              '按需开启：各类别必需的属性集、命名规则、分类、LOD 100–400 的属性和工程量、ISO 19650 的项目和作者字段、机电系统。',
              '您自己的要求：一个 IDS 1.0 文件、五个内置验证配置之一（基本交付、质量审查、BIM 协调、ISO 19650、LOD 300），或您自定义的配置。',
            ] },
            { h: '不会检查', items: [
              '两个模型之间的碰撞。碰撞规则只比较同一个模型内的包围盒，重叠阈值为 5 cm，最多 800 个构件、100 项结果。它只是初步筛查，不是协调。',
              '建筑规范：无障碍、消防、疏散路线或净高。这里没有任何规则读取法规条文。',
              '完整的 IFC schema。它不是 EXPRESS 一致性测试：它运行的是这 44 条规则和您的 IDS。',
              'ISO 19650 编码。文件名规则读取 IFC 文件头中写入的名称并统计其字段数；它不逐一核实每个编码。',
              '原生文件。它读取 IFC，不读取 Revit 或 Archicad 文件。',
            ] },
          ],
        },
        {
          kind: 'table', label: '限制', h2: '限制，用数字说明',
          head: ['', '限制'],
          rows: [
            ['文件大小', '达到 2 GB 的文件会被拒绝。从 200 MB 起显示提示，从 1 GB 起显示内存警告。在手机、平板以及内存为 4 GB 或更少的电脑上，警告从 80 MB 开始。'],
            ['格式', 'IFC2x3、IFC4、IFC4x1 和 IFC4x3，可以是 .ifc 文件，也可以放在 .ifczip 和 .zip 中。'],
            ['规则', '共 44 条，25 条默认开启。每条规则的严重程度和阈值都可以修改。'],
            ['IDS', 'IDS 1.0 及其六种分面。不读取 totalDigits、fractionDigits 和 whiteSpace 这几种限制。每条规范最多列出 200 个不合格构件。'],
            ['自动修复', '无效和重复的 GlobalId，以及为空或重复的名称。其余问题需要手动编辑，或回到建模软件中修复。'],
            ['速度', '图中的示例（2.3 MB，7,181 个实体）在制作这些截图的电脑上验证用了约 20 秒。耗时随实体数量增加。'],
            ['网络连接', '页面必须从互联网加载。不能离线使用。'],
          ],
        },
        {
          kind: 'text', label: '您的文件', h2: '文件会被怎样处理',
          ps: [
            'IFC 由运行在您浏览器标签页中的代码打开。它不会发送给我们，也不会发送给任何其他人，所以不需要等待上传，事后也没有什么需要删除。',
            '为了更快地重新打开模型，浏览器会把转换后的几何副本保存在您电脑上它自己的私有存储中（最多 4 GB，超出后先删除最旧的）。在浏览器中清除本网站的数据即可将其删除。',
            '有两样东西确实会离开浏览器，而且都由您控制。不使用 cookie 的使用统计会记录打开过一个文件、它的大小和构件数量，从不记录内容；统计可以关闭，并且遵守 Do Not Track。另外，如果您点击“分享”，链接本身会带有分数、文件名和前 50 个问题及其构件名称，因此任何拿到链接的人都能看到这些信息。',
          ],
        },
        { kind: 'shot', label: '结果', h2: '从分数到构件', sub: '先在这里用示例模型试一试，再打开您自己的文件。' },
        {
          kind: 'steps', label: '流程', h2: '从文件到修正后的 IFC',
          steps: [
            ['打开文件', '把 .ifc 拖进页面。可以同时打开多个文件；每个文件单独验证。'],
            ['查看结论', '分数、错误和警告，以及能挽回最多分数的三项修复。点击一次即可高亮不合格的构件。'],
            ['修复能在这里修复的问题', '重新生成无效的 GlobalId、批量重命名、编辑名称和属性值。每次编辑都可以撤销。'],
            ['导出', '由解析器重新写出的修正后的 IFC，以及检查结果：BCF 2.1、CSV、JSON、HTML 交付报告或 COBie 表格。'],
          ],
        },
        {
          kind: 'text', label: '价格', h2: '费用是多少',
          ps: [
            '不收费。查看器、44 条规则、IDS、修复功能以及本页提到的所有导出都是免费的，无需账号，商业项目也可以使用。源代码以 MIT 许可证公开在 [GitHub](github) 上。',
            '付费方案（Pro 每月 19 欧元，Team 每位编辑者每月 35 欧元）针对的是需要服务器的功能，例如存储模型和保存规则集。这些方案尚未开售；[价格页面](pricing)说明了每个方案将包含什么。',
          ],
        },
      ],
      faq: [
        ['IFC 文件会上传到服务器吗？', '不会。文件由运行在您浏览器标签页中的代码读取。离开浏览器的只有匿名使用统计（文件大小和构件数量，从不包含内容）以及您自己创建的分享链接。'],
        ['它能读取哪些 IFC 版本？', 'IFC2x3、IFC4、IFC4x1 和 IFC4x3，可以是 .ifc 文件，也可以放在 .ifczip 和 .zip 压缩包中。2 GB 及以上的文件会被拒绝。'],
        ['它能替代碰撞检测工具吗？', '不能。碰撞规则只比较单个模型内的包围盒，并且默认关闭。它们用来在发出模型之前找出明显的重叠；专业之间的协调需要碰撞检测工具。'],
        ['我能按自己的要求检查模型吗？', '可以。加载一个 IDS 1.0 文件，或从七套现成的要求集（ISO 19650 交付、LOD 200 和 LOD 400、COBie 移交等）中选一套开始。您也可以用自己的命名规则和必需属性集建立验证配置。'],
        ['我能修复错误并重新导出 IFC 吗？', 'GlobalId 和名称可以自动修复；名称、描述和属性值可以手动编辑，并可撤销。导出时会带着这些修改重新写出 IFC。几何和关系不能编辑。'],
        ['没有互联网连接能用吗？', '不能。页面必须从互联网加载。对于无法访问互联网的网络，可以选择[本地部署](onprem)。'],
      ],
      bottom: ['现在就检查一个文件', '免费，无需账号，文件留在您的浏览器中。'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    cloud: {
      title: '云端 IFC 验证器 — 在线验证 IFC，无需上传（免费）',
      desc: '在网页上检查 IFC，无需上传模型：44 条规则、IDS 1.0 和 Health Score 都在您的浏览器中计算。免费，无需账号，文件最大 2 GB。',
      nav: '云端 IFC 验证器',
      kicker: '在线 · 无需上传 · 44 条规则 · IDS 1.0 · 免费',
      h1: ['云端 IFC 验证器', '无需上传'],
      lead: '云端 IFC 检查工具通常意味着把模型发送到别人的服务器上。这个工具是一个网页，工作在您自己的浏览器中完成：同样方便，而文件始终不离开您的电脑。',
      cta: '验证 IFC 文件',
      cta2: '或打开示例模型',
      note: '无需账号。可在 Chrome、Edge、Firefox 和 Safari 中使用。单个文件最大 2 GB。',
      shots: [
        { alt: '在浏览器中对 IFC 模型进行 IDS 检查：规范“Walls declare a FireRating in Pset_WallCommon”在 3D 显示的两层住宅的 57 面墙上不通过', cap: '用一个 IDS 1.0 示例检查模型：57 面墙中没有一面声明了耐火等级。模型和 IDS 都在浏览器标签页中读取。' },
        { alt: 'IFC 验证的导出对话框，包含 JSON、CSV、证书、BCF、交付报告和 COBie 等格式', cap: '检查结果以您下载的文件形式带走：BCF 2.1、CSV、JSON、HTML 交付报告或 COBie 表格。' },
      ],
      sections: [
        {
          kind: 'table', label: '上传还是浏览器', h2: '需要上传的检查服务，和不需要上传的网页',
          sub: 'Solibri WebChecker 是公开资料最清楚的云端检查服务，所以这里拿它来对比。它那一列引用的是 Solibri 自己的页面。',
          head: ['', 'Solibri WebChecker (Beta)', 'IFC Viewer Online'],
          rows: [
            ['模型去了哪里', '上传到该服务。数据存储在欧盟或美国，在创建项目时选择', '哪里都不去。在您的浏览器标签页中读取'],
            ['结果保留多久', '30 天，之后删除', '直到您关闭标签页。您导出的内容归您保留'],
            ['文件大小', '每个 IFC 文件最大 5 GB', '每个文件小于 2 GB，内存较小的电脑上更小'],
            ['账号', '需要 Solibri ID 以及 Solibri Advanced 或 Premium 方案', '不需要'],
            ['每次检查的费用', '50 个 token。Advanced 每年包含 1,750 个 token，Premium 包含 17,500 个；5,000 个 token 的套餐售价 250 欧元', '免费'],
            ['检查内容', 'Solibri 的 Model Health 检查，或在 Solibri 桌面应用中准备的自定义规则集（.cset）', '44 条固定规则和您的 IDS 1.0 文件'],
            ['结果', 'PDF 和 BCF；Premium 可导出 SMC 文件', 'BCF 2.1、CSV、JSON、HTML 报告、COBie 表格。没有 PDF 文件：HTML 报告可从浏览器打印'],
          ],
          after: [
            '当文件大到浏览器装不下、结果必须对整个项目团队保持可用，或者检查必须无人值守地运行时，服务器才有存在的必要。这些情况在这里都不会发生：本页面是在一个人自己的电脑上检查这个人的文件。',
            '当模型不允许离开单位、本周没有人会批准新的供应商，或者您只是需要对一个文件得到答案时，浏览器更合适。',
          ],
          sources: ['solibriWebchecker', 'solibriPricing'],
        },
        {
          kind: 'cols', label: '范围', h2: '它检查什么，不检查什么',
          cols: [
            { h: '会检查', items: [
              '44 条规则，分为八组：标识符、空间结构、楼层、名称、属性值、类型、材质、导出质量。25 条默认运行。',
              'IDS 1.0 文件，包括六种分面：实体、特性、属性、分类、材质和从属关系。',
              '五个内置验证配置（基本交付、质量审查、BIM 协调、ISO 19650、LOD 300），或您自己的配置。',
            ] },
            { h: '不会检查', items: [
              '模型之间的碰撞。只比较同一个模型内的包围盒，默认关闭。',
              '建筑规范或为您的项目编写的设计规则。没有规则编辑器；要求以 IDS 的形式输入。',
              '批量处理。每个文件都由人打开；没有任何东西按计划自动运行。',
            ] },
          ],
        },
        {
          kind: 'table', label: '限制', h2: '限制，用数字说明',
          head: ['', '限制'],
          rows: [
            ['文件大小', '达到 2 GB 的文件会被拒绝。从 200 MB 起显示提示，从 1 GB 起显示内存警告；在手机、平板以及内存为 4 GB 或更少的电脑上，从 80 MB 开始。'],
            ['格式', 'IFC2x3、IFC4、IFC4x1 和 IFC4x3，可以是 .ifc 文件，也可以放在 .ifczip 和 .zip 中。'],
            ['IDS', 'IDS 1.0。不读取 totalDigits、fractionDigits 和 whiteSpace 这几种限制。每条规范最多列出 200 个不合格构件。'],
            ['分享', '分享链接把分数和前 50 个问题放在 URL 里，最长 8,000 个字符。模型不在其中。'],
            ['网络连接', '页面必须从互联网加载。不能离线使用。'],
          ],
        },
        {
          kind: 'text', label: '您的文件', h2: '文件会被怎样处理',
          ps: [
            'IFC 由运行在您浏览器标签页中的代码打开，不会发送到任何地方。您可以自己核实：打开浏览器的开发者工具，观察 Network（网络）标签页，然后拖入一个文件。',
            '浏览器会把转换后的几何副本保存在您电脑上它的私有存储中（最多 4 GB），以便更快地重新打开模型。清除本网站的数据即可将其删除。',
            '不使用 cookie 的使用统计会记录文件大小和构件数量，从不记录内容，并且可以关闭。如果您创建分享链接，其中会包含分数、文件名以及最多 50 个问题及其构件名称。',
          ],
        },
        { kind: 'shot', label: '结果', h2: '在示例模型上试一试', sub: '下面的演示在本页面中运行。之后再打开您自己的文件。' },
        {
          kind: 'text', label: '价格', h2: '费用是多少',
          ps: [
            '不收费：查看器、规则、IDS 和导出都是免费的，无需账号。代码以 MIT 许可证公开在 [GitHub](github) 上。',
            '增加服务器功能的付费方案（存储模型、保存规则集、团队协作）在[价格页面](pricing)上有说明，目前尚未开售。',
          ],
        },
      ],
      faq: [
        ['这是云服务吗？', '它像云服务一样通过网页提供，但检查是由您的浏览器完成的。没有上传，没有排队，我们这边也不保存模型的副本。'],
        ['我怎样核实没有上传任何内容？', '打开浏览器的开发者工具，进入 Network（网络）标签页，然后拖入一个 IFC 文件。您会看到页面自身的文件被加载，而没有任何携带模型的请求。'],
        ['它能处理多大的文件？', '2 GB 及以上的文件会被拒绝，实际上限取决于电脑的内存：从 1 GB 起显示警告，在手机以及内存为 4 GB 或更少的设备上从 80 MB 起显示。Solibri WebChecker 每个文件最大接受 5 GB (solibri.com/solutions/webchecker，查阅于 2026-11-10)。'],
        ['可以自动化吗？', '在本页面上不行：每个文件都由人打开。另有一个 MCP 服务器（ifc-viewer-mcp），可以由助手或脚本在您自己的电脑上运行同样的验证；参见 [GitHub 上的源代码](github)。'],
        ['保密模型可以用它吗？', '模型留在您的电脑上，这通常就是保密协议所要求的。请对照您自己的规定核对两点：匿名使用统计（可以关闭）和分享链接（其中包含文件名和构件名称）。'],
      ],
      faqSources: ['solibriWebchecker'],
      bottom: ['不上传就检查一个文件', '免费，无需账号。模型留在您的电脑上。'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    onprem: {
      title: '本地部署 IFC 验证器 — 物理隔离网络中的 BIM 验证',
      desc: 'IFC 查看器、44 条规则的验证器和 IDS 检查，从您自己的网络提供，不需要互联网连接。包括容器镜像、安装配置、培训和支持。',
      nav: '本地部署 IFC 验证',
      kicker: '本地部署 · 无互联网连接 · 您自己的服务器',
      h1: ['本地部署 IFC 验证器', '用于保持封闭的网络'],
      lead: '公开版应用本来就在浏览器内读取 IFC 文件，但页面本身要从互联网加载。在不允许这样做的地方，同样的查看器、验证器和 IDS 检查可以由您自己服务器上的一个容器提供。',
      cta: '申请试点',
      cta2: '',
      note: '一个站点，范围固定：安装、按您的要求配置、一次培训和一段支持期。',
      shots: [
        { alt: 'IFC 验证器，内置验证配置列表已展开：基本交付、质量审查、BIM 协调、ISO 19650 合规和 LOD 300 设计', cap: '内置的验证配置。试点期间，会加载您自己的配置和 IDS 文件，并在您的模型上测试。' },
        { alt: 'IFC 验证器中的 IDS 检查结果：一条规范未通过，57 面墙中有 0 面带有 FireRating 属性，并有高亮、隔离和导出按钮', cap: '用 IDS 文件检查的模型：57 面墙不满足耐火等级要求。本地部署时，模型和要求都留在您的网络内。' },
      ],
      sections: [
        {
          kind: 'cols', label: '适用对象', h2: '当“不上传任何内容”还不够时',
          cols: [
            { h: '适用的情况', items: [
              '工作站无法访问互联网，或不允许从互联网加载软件。',
              '您需要一个经过审计的版本，在您决定之前不会变化。',
              '承包商的模型必须按您的 IDS 或 EIR 检查，且不能经过第三方。',
              '出问题时，您希望有人可以联系。',
            ] },
            { h: '不需要它的情况', items: [
              '您的规定只禁止上传模型。[公开版验证器](validator)不会上传模型。',
              '您有人手自行托管。代码采用 MIT 许可证，并附带 Dockerfile：构建镜像并提供服务即可。试点增加的是配置、培训和支持，而不是另一个产品。',
            ] },
          ],
        },
        {
          kind: 'table', label: '您得到什么', h2: '安装什么，不安装什么',
          head: ['', '详情'],
          rows: [
            ['软件', '查看器、带 Health Score 的 44 条规则、IDS 1.0、BCF 2.1 和 3.0、同时打开多个模型、测量和剖切。这是一个静态 Web 应用，由容器中的 nginx 提供；检查在每位用户的浏览器中运行。'],
            ['服务器', '任何能运行容器的机器。它只负责提供文件，所以要求很低：工作由各工作站完成。'],
            ['连接', '此版本没有出站连接，也没有使用统计。'],
            ['离线时不可用', '3D 地图环境（地形、OpenStreetMap 建筑）和在线示例模型，因为它们需要从互联网下载。'],
            ['您的要求', '加载您的 IDS 文件、验证配置和命名规则，并在您自己的模型上测试。'],
            ['更新', '一个新的镜像文件，通过您选择的渠道交付。任何东西都不会自行更新。'],
            ['硬件', '您自己的服务器或虚拟机。如有需要，可以提供预先配置好的网关设备。'],
          ],
        },
        {
          kind: 'table', label: '其他选择', h2: '我们所知的另一个物理隔离方案',
          sub: '如果您正在比较，以下是 Solibri 就其离线方案公开的内容。',
          head: ['', 'Solibri Security+', 'IFC Viewer Online 本地部署'],
          rows: [
            ['官方描述', '“Fully offline operation (no telemetry)”、“Air-gapped by design”、“Controlled update cycles”', '您服务器上的一个容器；没有出站连接'],
            ['价格', '未公开；“Talk with an expert”', '在确定范围的通话之后，按试点报价'],
            ['检查内容', 'Solibri 基于规则的验证', '44 条固定规则和 IDS 1.0；碰撞仅按包围盒检查'],
          ],
          after: [
            '当您需要专业之间的碰撞检测，或需要为本单位编写的规则时，Solibri 是更强的选择。这套安装做的事情更小：打开一份交付文件，按您的要求检查它，并返回检查结果。',
          ],
          sources: ['solibriPricing'],
        },
        {
          kind: 'steps', label: '试点', h2: '试点如何进行',
          steps: [
            ['范围确认通话', '您的网络规定、模型的大小、您的要求以及谁会使用它。'],
            ['安装', '安装在您的服务器上，并加载您的 IDS 文件和验证配置。'],
            ['培训', '与您的 BIM 协调员进行一次培训，使用您自己的模型。'],
            ['决定', '支持期结束后，由您决定是否扩展到其他站点。'],
          ],
        },
        {
          kind: 'form', label: '申请试点', h2: '告诉我们您的环境',
          sub: '此表单会在您自己的邮件程序中打开一封邮件。不会向我们的服务器发送任何内容。',
          org: '单位', sector: '行业',
          sectors: ['国防 / 安全', '能源 / 公用事业', '交通 / 基础设施', '政府机构', '工业 / 制造业', '建筑工程企业（AEC）', '其他'],
          deploy: '网络', deploys: ['完全无法访问互联网', '专用网络，互联网受限', '位于本地区的私有云', '尚未确定'],
          hw: '硬件', hws: ['我们自己的服务器或虚拟机', '预先配置好的网关设备', '尚未确定'],
          need: '您需要检查什么？模型大约有多大？',
          submit: '打开邮件', direct: '或直接写信至', subject: '本地部署 IFC 验证试点',
        },
      ],
      faq: [
        ['有任何东西会离开我们的网络吗？', '没有。容器向您的浏览器提供应用，不建立任何出站连接；此版本不带使用统计。模型在每位用户的浏览器中读取，不存储在服务器上。'],
        ['它和公开版应用有什么不同？', '程序是同一个。变化的是它从哪里提供、它是一个固定版本，以及需要互联网的功能（地图环境和在线示例模型）不可用。'],
        ['我们可以不通过你们自行托管吗？', '可以。源代码以 MIT 许可证公开，并包含 Dockerfile 和 nginx 配置。试点面向的是希望有人配置、讲解并提供支持的团队。'],
        ['模型可以有多大？', '与公开版应用相同：每个文件小于 2 GB，实际受每台工作站内存的限制，因为检查在浏览器中运行。'],
        ['费用是多少？', '试点在范围确认通话之后报价，因为它取决于站点数量和您需要的支持。目前还没有公开的价目表。'],
      ],
      bottom: ['您的网络能上网吗？那它本来就是免费的', '公开版验证器在您的浏览器中读取文件，不上传任何内容。'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    solibri: {
      title: '免费 Solibri 替代方案 — 在浏览器中验证 IFC',
      desc: '什么时候免费的浏览器验证器就够用，什么时候需要 Solibri：根据 Solibri 自己的页面（查阅于 2026-11-10）对比价格、碰撞检测、规则和 IDS。',
      nav: 'Solibri 替代方案',
      kicker: '免费 · 在浏览器中 · 与 Solibri 公开的方案对比',
      h1: ['免费的 Solibri 替代方案', '用于在交付前检查 IFC'],
      lead: 'Solibri 是一个基于规则的检查平台，按方案销售，每个许可证每年 99 欧元到 2,772 欧元。IFC Viewer Online 是一个免费网页，它打开 IFC，运行 44 条固定规则和您的 IDS，并显示哪些不通过。有些工作它可以替代 Solibri，有些不行；本页说明是哪些。',
      cta: '验证 IFC 文件',
      cta2: '或打开示例模型',
      note: '无需账号，无需安装，文件不会上传。',
      heroSources: ['solibriPricing'],
      shots: [
        { alt: '在浏览器中检查 IFC 模型并开启碰撞规则：Health Score 70，36 处构件碰撞排在修复列表首位，相关构件在 3D 视图中高亮显示', cap: '开启碰撞规则后的示例模型：包围盒之间有 36 处重叠，分数从 77 降到 70。这是单个模型内的初步筛查，不是 Solibri 销售的那种碰撞检测。' },
        { alt: '浏览器中的 IDS 检查：一条要求墙体具有耐火等级的 IDS 规范，3D 显示的 IFC 模型的 57 面墙未通过', cap: '用 IDS 1.0 文件检查模型，免费且无需账号：57 面墙缺少规范要求的耐火等级。' },
      ],
      sections: [
        {
          kind: 'table', label: '对比', h2: 'Solibri 与 IFC Viewer Online 并排对比',
          sub: 'Solibri 一列只写 Solibri 公开的内容。凡是它的页面没有说明的事项（操作系统、文件大小限制），表中就没有对应的行。',
          head: ['', 'Solibri', 'IFC Viewer Online'],
          rows: [
            ['价格', 'Starter 99 欧元、Essential 1,428 欧元、Advanced 2,109 欧元、Premium 2,772 欧元：每个许可证每年的起步价。Security+ 需询价', '免费。针对服务器功能的付费方案尚未开售'],
            ['模型检查', '从 Essential 起。Starter 用于查看模型和审阅结果：“Model checking is performed in Solibri Essential, Advanced, or Premium”', '已包含：44 条固定规则，25 条默认开启'],
            ['碰撞检测', 'Essential：基于规则的碰撞检查，硬碰撞和软碰撞。Advanced：带容差的专业间碰撞矩阵', '仅包围盒，限于单个模型内，重叠阈值 5 cm，最多 800 个构件、100 项结果。默认关闭'],
            ['自定义规则', 'Advanced 和 Premium：“Custom rule creation and modification”', '没有规则编辑器。您可以开关规则、修改其严重程度，并设置命名规则和必需属性集；其他要求以 IDS 的形式输入'],
            ['IDS', 'Essential 按 IDS 定义检查必需属性。Advanced 增加 IDS 工作流、IDS 编辑器和 IDS 验证器', 'IDS 1.0 及其六种分面。有三种限制（totalDigits、fractionDigits、whiteSpace）不读取'],
            ['BCF', '从 Essential 起：“BCF issue management and CDE integrations”', '读写 BCF 2.1 和 3.0 文件。不连接 BCF 服务器或 CDE'],
            ['原生 Revit 模型', '从 Essential 起：“IFC and native Revit model federation”', '仅 IFC'],
            ['工程量提取', 'Advanced：“Quantity / Information Takeoff (QTO / ITO)”', '汇总 IFC 中已写入的工程量。没有提取规则'],
            ['无互联网', 'Security+：“Fully offline operation (no telemetry)”', '页面从互联网加载；文件不上传。另有[本地部署](onprem)可选'],
          ],
          after: [
            '如果您要协调多个专业并需要真正的碰撞检测，如果您的单位自己编写规则，或者检查必须在许多项目之间统一管理，请选择 Solibri。本页面上的任何功能都做不到这些。',
            '如果您今天就想知道某一个 IFC 是否可以发出：标识符、结构、名称、属性、您的 IDS，请选择 IFC Viewer Online。它也适合 Solibri 团队周围那些没有许可证的人：导出模型的建筑师、接收模型的业主。',
            '许多团队会两者都用：导出前在浏览器中快速检查，协调时用 Solibri。',
          ],
          sources: ['solibriPricing', 'solibriStarter', 'solibriEssential', 'solibriAdvanced'],
        },
        {
          kind: 'text', label: 'Solibri 现状', h2: '如果您在找 Solibri Office 或 Solibri Anywhere',
          ps: [
            'Solibri 的网站把 Solibri Office、CheckPoint、Anywhere 和 Site 列为旧版产品，它们“no longer available for new customers”。现行方案是 Starter、Essential、Advanced、Premium 和 Security+。',
            'Solibri Anywhere 的免费版对已经拥有它的人仍然可用，限于 26.4.0 之前的版本；Solibri 表示免费授权在更新的版本中不再提供。如果您过去用 Anywhere 打开和查看 IFC 文件，[查看器](viewer)可以免费做到这一点，在浏览器中，任何操作系统都行。',
          ],
          sources: ['solibriLegacy', 'solibriPricing'],
        },
        {
          kind: 'cols', label: '范围', h2: '这里有什么，没有什么',
          cols: [
            { h: '有', items: [
              '0 到 100 的 Health Score，以及能挽回最多分数的修复项。',
              '不合格的构件在 3D 模型中高亮显示，并按规则、楼层或类别列出。',
              'IDS 1.0 检查和五个内置验证配置，从基本交付到 ISO 19650 和 LOD 300。',
              'GlobalId 和名称的自动修复，名称和属性值的手动编辑，以及修正后的 IFC。',
              '检查结果可导出为 BCF 2.1、CSV、JSON、HTML 报告或 COBie 表格。',
            ] },
            { h: '没有', items: [
              '模型之间的碰撞检测，或基于真实几何的碰撞检测。',
              '规则编辑器、规范审查（无障碍、消防、疏散路线）或空间分析。',
              '在服务器上带任务分配的问题跟踪。BCF 文件靠手动交换。',
              '2 GB 及以上的文件。上限取决于您电脑的内存。',
            ] },
          ],
        },
        { kind: 'shot', label: '试用', h2: '在示例模型上运行', sub: '下面的演示会在本页面中加载验证器。' },
        {
          kind: 'text', label: '价格', h2: '费用是多少',
          ps: [
            '查看器、规则、IDS、修复功能和导出都是免费的，无需账号，商业项目也可以使用。源代码以 MIT 许可证公开在 [GitHub](github) 上。',
            '付费方案（Pro 每月 19 欧元，Team 每位编辑者每月 35 欧元）将增加需要服务器的功能；目前尚未开售。参见[价格页面](pricing)。',
          ],
        },
      ],
      faq: [
        ['IFC Viewer Online 能替代 Solibri 吗？', '对于交付前检查单个 IFC（标识符、空间结构、名称、属性、IDS），可以。对于专业间碰撞检测、自定义规则和跨项目的统一管理，不能：那是 Solibri Essential 和 Advanced 的用途。'],
        ['Solibri 多少钱？', 'Solibri 公开的是每个许可证每年的起步价：Starter 99 欧元、Essential 1,428 欧元、Advanced 2,109 欧元、Premium 2,772 欧元。Security+ 需询价 (solibri.com/pricing，查阅于 2026-11-10)。'],
        ['Solibri 有免费版吗？', '曾有免费版的 Solibri Anywhere 现在是旧版产品，不再向新客户提供；现有的免费用户可以继续使用 26.4.0 之前的版本 (solibri.com/products/legacy-products，查阅于 2026-11-10)。目前最便宜的方案是 Starter，每年 99 欧元。'],
        ['99 欧元的 Starter 方案能检查模型吗？', '按 Solibri 的说法，Starter 用于目视检查以及审阅他人完成的检查结果：“Model checking is performed in Solibri Essential, Advanced, or Premium” (solibri.com/products/starter，查阅于 2026-11-10)。'],
        ['Solibri 能做而这里做不到的有哪些？', '基于真实几何以及模型之间的碰撞检测、为本单位编写的规则、工程量提取规则、原生 Revit 模型、BCF 服务器和 CDE 连接，以及完全离线的方案。参见上面的表格。'],
        ['可以两者都用吗？', '可以，而且这是常见的分工：建模人员和业主在发出文件前在浏览器中检查，协调团队在合模后的模型上运行 Solibri。'],
      ],
      faqSources: ['solibriPricing', 'solibriLegacy', 'solibriStarter'],
      bottom: ['做决定之前，先检查一个文件', '只需一分钟，不花钱，模型留在您的电脑上。'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    webchecker: {
      title: 'Solibri WebChecker 替代方案 — 免费网页 IFC 检查器',
      desc: 'Solibri WebChecker 需要 Advanced 或 Premium 方案，并且要上传 IFC。这个免费替代方案在您的浏览器中检查文件。两者各做什么，附来源。',
      nav: 'Solibri WebChecker 替代方案',
      kicker: '免费 · 无需 Solibri 方案 · 文件不会上传',
      h1: ['Solibri WebChecker 替代方案', '在您自己的浏览器中检查 IFC'],
      lead: 'Solibri WebChecker (Beta) 在线运行 Solibri 的检查引擎：您上传一个 IFC，它在 Solibri 的服务上被检查，然后您下载 PDF 或 BCF。它随 Advanced 和 Premium 方案提供。如果您需要网页检查但没有这些方案，或者不想上传模型，本页面可以在您的浏览器中完成，检查项目较少。',
      cta: '验证 IFC 文件',
      cta2: '或打开示例模型',
      note: '无需账号，无需 token。单个文件最大 2 GB。',
      heroSources: ['solibriWebchecker'],
      shots: [
        { alt: '网页 IFC 检查：浏览器查看器的验证面板中，按规则分组的问题列表及不合格构件的数量', cap: '一次检查的结果，按规则分组。得到这些结果没有上传任何内容。' },
        { alt: '从浏览器导出 IFC 检查结果，格式包括 BCF、CSV、JSON、交付报告和 COBie', cap: '结果可导出为 BCF 2.1、CSV、JSON、HTML 报告或 COBie 表格。没有 PDF 文件；HTML 报告可从浏览器打印。' },
      ],
      sections: [
        {
          kind: 'table', label: '对比', h2: 'Solibri WebChecker 与 IFC Viewer Online',
          sub: 'WebChecker 一列取自 Solibri 自己的页面。',
          head: ['', 'Solibri WebChecker (Beta)', 'IFC Viewer Online'],
          rows: [
            ['使用条件', '包含在 Solibri Advanced（每年 2,109 欧元起）和 Premium（2,772 欧元起）中。Starter、Essential 和 Security+ 不包含，并且“not a standalone product”。需要 Solibri ID', '打开页面即可。无需账号'],
            ['每次检查的费用', '50 个 token。Advanced 每年包含 1,750 个 token（约 35 次检查），Premium 包含 17,500 个（约 350 次）。额外 token：5,000 个 250 欧元，10,000 个 450 欧元，25,000 个 750 欧元', '免费，检查次数不限'],
            ['模型去了哪里', '上传。数据驻留在欧盟或美国，在创建项目时选择', '留在您的浏览器标签页中'],
            ['结果保留时间', '30 天', '直到您关闭标签页；需要的内容请导出'],
            ['文件大小', '每个 IFC 文件最大 5 GB', '小于 2 GB，内存较小的电脑上更小'],
            ['检查内容', 'Model Health 检查（结构和分类、命名和标识符、通过基于 IDS 的检查核对关键属性、专业之间的几何硬碰撞），或在桌面应用中制作的自定义 .cset 规则集', '44 条固定规则和 IDS 1.0 文件。碰撞仅按包围盒检查，且限于单个模型内'],
            ['结果', 'PDF 和 BCF（1.0、2.0、2.1 或 3.0）；Premium 用户可导出 SMC 文件', 'BCF 2.1、CSV、JSON、HTML 报告、COBie 表格'],
          ],
          after: [
            '如果您的 BIM 团队已经在维护 Solibri 规则集，并希望项目参与方运行的正是这些规则集，如果文件大于 2 GB，或者您需要报告中包含专业之间的硬碰撞，WebChecker 是更合适的工具。',
            '如果您没有 Advanced 或 Premium 方案，如果模型不允许上传，或者您检查得很频繁、不想计算 token，本页面是更合适的工具。',
          ],
          sources: ['solibriWebchecker', 'solibriPricing'],
        },
        {
          kind: 'cols', label: '范围', h2: '这项检查涵盖什么，不涵盖什么',
          cols: [
            { h: '会检查', items: [
              '标识符、空间结构、楼层、名称、属性值、类型和材质：44 条规则，25 条默认开启。',
              'IDS 1.0 文件及其六种分面。',
              '五个内置验证配置，或您自己的命名规则和必需属性集。',
            ] },
            { h: '不会检查', items: [
              'Solibri 规则集。这里无法加载 .cset 文件。',
              '专业之间的硬碰撞、无障碍规则或空间分析。',
              '2 GB 及以上的文件。',
            ] },
          ],
          sources: ['solibriWebchecker'],
        },
        {
          kind: 'text', label: '您的文件', h2: '文件会被怎样处理',
          ps: [
            'IFC 由运行在您浏览器标签页中的代码读取，不会上传。浏览器会把转换后的几何副本保存在您电脑上它的私有存储中（最多 4 GB），以便更快地重新打开；清除本网站的数据即可将其删除。',
            '不使用 cookie 的使用统计会记录文件大小和构件数量，从不记录内容，并且可以关闭。如果您创建分享链接，URL 里会带有分数、文件名以及最多 50 个问题。',
          ],
        },
        { kind: 'shot', label: '试用', h2: '在示例模型上运行一次检查', sub: '下面的演示会在本页面中加载验证器。' },
        {
          kind: 'text', label: '价格', h2: '费用是多少',
          ps: [
            '不收费，也没有 token。查看器、规则、IDS 和导出都是免费的，无需账号。代码以 MIT 许可证公开在 [GitHub](github) 上。',
            '增加服务器功能的付费方案在[价格页面](pricing)上有说明，目前尚未开售。其他方案和价格的对比见[另一个页面](solibri)。',
          ],
        },
      ],
      faq: [
        ['Solibri WebChecker 是什么？', '用 Solibri 的话说，是“a browser-based model validation service that runs Solibri\'s rules-based checking engine online”。用户上传 IFC 模型，运行 Model Health 检查或自定义规则集，然后导出 PDF 或 BCF (solibri.com/solutions/webchecker，查阅于 2026-11-10)。'],
        ['Solibri WebChecker 免费吗？', '不免费。它包含在 Solibri Advanced 和 Premium 中，不单独销售。每次检查消耗 50 个 token，从方案的年度额度中扣除，或从 token 套餐中扣除，套餐起价为 5,000 个 token 250 欧元 (solibri.com/solutions/webchecker，查阅于 2026-11-10)。'],
        ['WebChecker 会上传我的模型吗？', '会：Solibri 把它描述为一项由用户上传 IFC 模型的服务，数据存储在欧盟或美国，结果保留 30 天 (solibri.com/solutions/webchecker，查阅于 2026-11-10)。IFC Viewer Online 则是在您的浏览器中读取文件。'],
        ['我能在这里运行我的 Solibri 规则集吗？', '不能。Solibri 规则集（.cset）只能在 Solibri 中运行。能够写成 IDS 1.0 的要求可以在这里检查。'],
        ['哪一个能发现更多问题？', '它们查找的东西不同。WebChecker 的 Model Health 检查包含专业之间的硬碰撞，本页面不做这项检查。本页面给出分数，并能自动修复标识符和名称。做协调请使用 Solibri。'],
      ],
      faqSources: ['solibriWebchecker'],
      bottom: ['现在就运行一次网页检查', '无需方案，无需 token，无需上传。'],
    },

    // ─────────────────────────────────────────────────────────────────────────
    mac: {
      title: 'Mac 版 IFC 查看器 — 免费，无需安装，在 Safari 中运行',
      desc: '在 Mac 上用 Safari、Chrome 或 Firefox 打开 IFC 文件：3D 视图、属性、剖切、测量和验证。无需安装，无需账号，免费。',
      nav: 'Mac 版 IFC 查看器',
      kicker: 'macOS · Safari、Chrome、Firefox、Edge · 无需安装 · 免费',
      h1: ['Mac 版 IFC 查看器', '在您已有的浏览器中运行'],
      lead: '没有需要下载的应用：这个查看器是一个网页。在 macOS 上用 Safari 或 Chrome 打开它，拖入一个 IFC 文件，就能得到 3D 模型、空间结构树、每个构件的属性、剖切、测量和验证报告。文件不会上传。',
      cta: '打开查看器',
      cta2: '或打开示例模型',
      note: '无需账号。支持 IFC2x3、IFC4、IFC4x1 和 IFC4x3，单个文件最大 2 GB。',
      shots: [
        { alt: '1440 × 900 浏览器窗口（MacBook 屏幕的大小）中的 IFC 查看器：一栋两层住宅的 3D 视图，左侧是空间结构树，右侧是所选墙体的 IFC 特性和属性集', cap: '1440 × 900 窗口中的查看器，这是 MacBook Air 屏幕的默认大小（在 Chrome 中截取）。右侧是所选墙体的特性和属性集。' },
        { alt: '浏览器查看器中剖切平面切开一栋住宅的 IFC 模型，可以看到内部的家具，窗口大小为 1440 × 900', cap: '穿过同一模型的剖切平面，可以用滑块移动，也可以在视图中直接拖动。不需要任何插件。' },
      ],
      sections: [
        {
          kind: 'cols', label: '在 Mac 上', h2: '在 macOS 上哪些能用，需要注意什么',
          cols: [
            { h: '可以使用', items: [
              '在 macOS 上的 Safari、Chrome、Firefox 和 Edge 中。页面需要 WebGL 和 WebAssembly，这些浏览器都自带。',
              '打开 .ifc 文件以及 .ifczip 或 .zip 压缩包，方法是把它们拖进窗口，或使用“打开”按钮。',
              '同时打开多个模型，每个模型有自己的结构树和属性。',
              '在 iPad 或 iPhone 上也可以，但文件要小一些。',
            ] },
            { h: '请注意', items: [
              '它不是 macOS 应用：没有程序坞图标，没有“快速查看”预览，.ifc 文件也不能双击打开。',
              '页面必须从互联网加载。不能离线使用。',
              '文件大小上限为 2 GB，实际上取决于 Mac 的内存：从 1 GB 起显示警告，在内存为 4 GB 或更少的机器以及 iPad 和 iPhone 上从 80 MB 起显示。',
              '本页的截图是在 Chrome 中制作的。如果在 Safari 中显示不正常，请试试 Chrome。',
            ] },
          ],
        },
        {
          kind: 'cols', label: '工具', h2: '可以对模型做什么',
          cols: [
            { h: '查看', items: [
              '旋转、平移和缩放；隐藏和隔离构件；浏览空间结构树。',
              '剖切平面，以及从模型切出的 2D 平面图，可导出为 DXF、SVG 或 PDF。',
              '测量距离、面积、角度和净距。',
              '读取文件中写入的每个属性集和工程量。',
            ] },
            { h: '检查和修复', items: [
              '44 条规则的验证和 0 到 100 的 Health Score；参见 [IFC 验证器](validator)。',
              '按您自己的要求进行 IDS 1.0 检查。',
              '编辑名称和属性值，修复 GlobalId，并导出修正后的 IFC 或 GLB。',
              '打开和写出 BCF 2.1 和 3.0 文件。',
            ] },
          ],
        },
        {
          kind: 'table', label: '对比', h2: '在 Mac 上打开 IFC 的其他方式',
          sub: 'Flinker 是我们常被问到的另一个免费浏览器查看器。它那一列写的是 Flinker 公开的内容。',
          head: ['', 'Flinker', 'IFC Viewer Online'],
          rows: [
            ['它是什么', '“The IFC viewer for Microsoft”：SharePoint、Teams、Excel、Power BI、Windows 和浏览器', '网页中的查看器、验证器和编辑器'],
            ['在 Mac 上', '浏览器版查看器。桌面应用面向 Windows；网站没有提到 macOS', 'macOS 上任何当前版本的浏览器'],
            ['开始使用', '“Open a model without creating an account”', '无需账号'],
            ['格式', 'IFC 2x3、4 和 4x3；BCF 2.1 和 3.0；IDS 1.0；DXF；PDF 叠加', 'IFC2x3、IFC4、IFC4x1 和 IFC4x3；BCF 2.1 和 3.0；IDS 1.0'],
            ['文件', '在浏览器中解析；留在设备上或您选择的 Microsoft 存储中', '在浏览器中读取；不上传'],
            ['检查', 'IDS 要求检查，高亮显示通过和未通过的构件', '带 Health Score 的 44 条规则，外加 IDS'],
            ['价格', 'Community：免费。Enterprise：按部署报价', '免费'],
          ],
          after: [
            '如果您的项目已经放在 SharePoint 和 Teams 中，请选择 Flinker：在文档旁边打开模型正是它的设计用途，而本查看器不连接 Microsoft 365。',
            '如果您还想知道模型质量好不好，请选择 IFC Viewer Online：区别就在于验证、分数和修复。',
            '关于 Solibri：我们在同一天查阅的产品页面没有说明它的方案能在哪些操作系统上运行，所以我们不作说明。为 Mac 购买之前，请先查看 Solibri 的系统要求。',
          ],
          sources: ['flinkerViewer', 'solibriPricing'],
        },
        { kind: 'shot', label: '试用', h2: '打开示例模型', sub: '下面的演示在本页面中运行，用的就是您现在使用的浏览器。' },
        {
          kind: 'text', label: '价格', h2: '费用是多少',
          ps: [
            '不收费。没有许可证，没有试用期，也不需要账号。代码以 MIT 许可证公开在 [GitHub](github) 上。增加服务器功能的付费方案见[价格页面](pricing)，目前尚未开售。',
          ],
        },
      ],
      faq: [
        ['有不需要安装的 Mac 版 IFC 查看器吗？', '有：这个查看器就是一个网页。在 macOS 上用 Safari、Chrome、Firefox 或 Edge 打开它，然后拖入文件。不需要下载或安装任何东西。'],
        ['它能在 Safari 中使用吗？', '能。它需要 WebGL 和 WebAssembly，当前版本的 Safari 都自带。本页的截图是在 Chrome 中制作的，所以如果某个模型显示不正常，请试试 Chrome。'],
        ['打开 IFC 时它会被上传吗？', '不会。文件由运行在浏览器标签页中的代码读取。离开浏览器的只有匿名使用统计（文件大小和构件数量），并且可以关闭。'],
        ['我能打开 Revit 或 Archicad 文件吗？', '不能，只能打开 IFC。请先从建模软件导出 IFC。'],
        ['它能在 Mac 上离线使用吗？', '不能。页面每次都必须从互联网加载，不过模型本身从不会被发送出去。'],
        ['Flinker 有 Mac 版吗？', 'Flinker 的查看器在浏览器中运行，所以可以通过这种方式在 Mac 上使用；它的桌面应用是面向 Windows 发布的，网站没有提到 macOS (flinker.app/products/ifc-viewer，查阅于 2026-11-10)。'],
      ],
      faqSources: ['flinkerViewer'],
      bottom: ['在您的 Mac 上打开 IFC', '在浏览器中，免费，无需安装。'],
    },
  },
}
