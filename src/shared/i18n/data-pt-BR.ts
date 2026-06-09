// Brazilian Portuguese OVERRIDES for registry data (module/preset/provider labels
// & descriptions authored in English inside the registries). English is canonical
// at the source, so this only holds translations; any missing key falls back to
// the English the call site passes in. Keys come from the builders in `registry.ts`
// (`moduleKey`/`presetKey`/`paramKey`/`groupKey`/`aiProviderKey`/`aiPresetKey`) —
// keep them in sync. The i18n coverage test guards that every registry string has
// an entry here, so a new module/preset/provider can't ship English-only.
export const dataPtBR: Record<string, string> = {
  // --- structure families (groups) ------------------------------------------
  'group.house': 'Casa',

  // --- structure types ------------------------------------------------------
  'mod.structure.classic.label': 'Clássica',
  'mod.structure.classic.desc':
    'Uma casa de vários andares com telhado inclinado, pilares de canto emoldurados, uma porta central e janelas em faixa. Define toda a sua volumetria: porão opcional, 1–4 andares acima do solo, sótão opcional no telhado, um núcleo de escadas conectado e uma varanda coberta opcional. A decoração fornece os materiais e (opcionalmente) o desgaste.',
  'mod.structure.modern.label': 'Casa moderna',
  'mod.structure.modern.desc':
    'Uma vila contemporânea de telhado plano: volumes de concreto branco empilhados e deslocados, com andar superior recuado e terraço na cobertura, paredes-cortina de vidro do piso ao teto interrompidas por colunas escuras de destaque e guarda-corpos de vidro. A alternativa moderna à casa de telhado inclinado — combine com a decoração Moderna para materiais de branco e vidro.',
  'mod.structure.cabin.label': 'Cabana',
  'mod.structure.cabin.desc':
    'Uma cabana rústica de troncos e pedra: uma base elevada de pedra, pilares de canto em tronco e paredes de madeira, um telhado de duas águas íngreme com beirais profundos, uma varanda frontal coberta sobre pilares de tronco com guarda-corpos e degraus, e uma chaminé de pedra. A alternativa aconchegante e campestre à vila moderna.',
  'mod.structure.l-shaped.label': 'Casa em L',
  'mod.structure.l-shaped.desc':
    'Uma casa com planta em L: uma ala principal comprida e uma ala traseira perpendicular que se encontram em ângulo reto, deixando um terraço abrigado no canto interno. Dois telhados inclinados e um pátio com guarda-corpo lhe dão uma silhueta dividida e cheia de personalidade, em vez de uma única caixa.',
  'mod.structure.farmhouse.label': 'Fazenda',
  'mod.structure.farmhouse.desc':
    'Uma rústica casa de sítio: uma silhueta em L com telhado de duas águas cruzadas — nunca uma caixa — com uma varanda coberta e profunda sobre pilares de madeira e uma galeria superior na frente, um alpendre abrigado no canto, estrutura aparente de troncos escuros sobre uma base de pedra, um telhado escuro e íngreme de ardósia e uma chamine alta na empena. Espraiada, habitada, enraizada.',

  // --- decorations ----------------------------------------------------------
  'mod.decoration.cozy.label': 'Aconchegante',
  'mod.decoration.cozy.desc':
    'Um visual quente e habitado: pinheiro e carvalho em tons de mel, fundações de pedregulho e luz de lanterna. Sem deterioração ou desgaste — tudo intacto e convidativo, ideal para casas e cabanas.',
  'mod.decoration.haunted.label': 'Assombrada',
  'mod.decoration.haunted.desc':
    'Um visual decadente e assombrado: madeira de carvalho escuro sombria sobre fundações de pedregulho com musgo, vidro cinza encardido e a chama azul e fria das lanternas das almas. A pedra se desgasta em suas variantes com musgo e rachadas. O oposto do aconchegante — abandonado, deteriorado e perturbador. Ideal para casas assombradas, criptas e câmaras amaldiçoadas.',
  'mod.decoration.modern.label': 'Moderna',
  'mod.decoration.modern.desc':
    'Um visual contemporâneo e elegante: concreto branco e quartzo liso, colunas de destaque em blackstone polido escuro, preenchimento de madeira de carvalho escuro aconchegante, grandes paredes de vidro e a luz nítida das lanternas-do-mar. Sem deterioração — bordas limpas e definidas. Combine com a forma Moderna para uma vila de quartzo e vidro em vez de uma caixa de madeira.',
  'mod.decoration.farmhouse.label': 'Fazenda',
  'mod.decoration.farmhouse.desc':
    'A paleta rústica do campo: tábuas de carvalho quentes cruzadas por uma estrutura aparente de troncos escuros, uma base de pedregulho e um telhado escuro e íngreme de ardósia. O visual cor de mel e escuro de uma fazenda dos livros de histórias — combine com a estrutura Fazenda para a casa de sítio completa.',

  // --- basements ------------------------------------------------------------
  'mod.basement.cellar.label': 'Adega',
  'mod.basement.cellar.desc':
    'Uma adega de pedra subterrânea com planta variada (retangular/L/T/U/cruz): uma estrutura vedada com piso e teto distintos e uma grade de pilares de sustentação iluminados. Um subsolo versátil para armazenamento, oficina ou o início de um complexo maior sob a construção.',
  'mod.basement.crypt.label': 'Cripta',
  'mod.basement.crypt.desc':
    'Uma câmara funerária subterrânea: um subsolo de pedra vedado com um corredor processional central ladeado por colunas de catacumba, uma cornija de lajes sob o teto e fileiras de nichos funerários de ossos ao longo das paredes, iluminada pela chama azul e fria das lanternas das almas. Decore com crânios, teias de aranha, velas e um túmulo central. Combina melhor com o visual Assombrado.',
  'mod.basement.cult-temple.label': 'Templo de culto',
  'mod.basement.cult-temple.desc':
    'Uma câmara ritual oculta: um subsolo de blackstone vedado construído em torno de um altar elevado com um círculo de invocação embutido no piso, quatro pilares rituais nos cantos e o brilho azul e frio das lanternas das almas. Decore com uma fogueira das almas sobre o altar, círculos de velas, crânios e teias de aranha. Combina melhor com o visual Assombrado.',

  // --- roofs ----------------------------------------------------------------
  'mod.roof.gable.label': 'Duas águas',
  'mod.roof.gable.desc':
    'Um clássico telhado inclinado de dois lados: duas águas que se encontram em uma única cumeeira, com uma parede triangular de empena fechando cada extremidade. O telhado de casa/chalé mais comum — simples, íngreme o bastante para parecer uma inclinação de verdade, e o lar ideal para um sótão no vão.',
  'mod.roof.hip.label': 'Quatro águas',
  'mod.roof.hip.desc':
    'Um telhado inclinado de quatro lados: as quatro paredes sobem até uma cumeeira curta (ou um ponto, em planta quadrada), de modo que não há empenas verticais. Parece mais sólido e formal que o de duas águas, e contorna um beiral saliente de modo uniforme em todos os lados.',
  'mod.roof.flat.label': 'Plano',
  'mod.roof.flat.desc':
    'Um telhado plano moderno: as paredes são rematadas com um deque sólido e transitável e uma borda fina de platibanda — sem inclinação, sem cumeeira. Baixo, horizontal e contemporâneo; serve também de terraço. Como não deixa vão sob o telhado, um telhado plano não comporta sótão.',

  // --- attics ---------------------------------------------------------------
  'mod.attic.storage.label': 'Sótão de armazenamento',
  'mod.attic.storage.desc':
    'Um sótão bruto de armazenamento no vão do telhado: o espaço da empena assoalhado para baús, barris e tralhas, acessado por uma escada de mão do último andar. Simples e utilitário — não é um espaço de moradia. Precisa de um telhado inclinado (fica no vão por baixo).',
  'mod.attic.bedroom.label': 'Sótão-quarto',
  'mod.attic.bedroom.desc':
    'Um sótão-quarto acabado no vão do telhado: o espaço da empena assoalhado com tábuas de verdade como um aconchegante quarto no andar de cima — uma cama sob a inclinação, um tapete e uma mesa de apoio — acessado por uma escada de mão do último andar. Precisa de um telhado inclinado (fica no vão por baixo).',

  // --- exterior styles ------------------------------------------------------
  'mod.exterior.farmhouse.label': 'Acabamento fazenda',
  'mod.exterior.farmhouse.desc':
    'Um acabamento rústico de campo: tábuas de carvalho quentes cruzadas por uma estrutura aparente de troncos escuros, um telhado escuro de ardósia, uma base profunda de pedra e grandes janelas em faixa. Uma camada de revestimento + estrutura sobre o casco escolhido — para a forma de sítio completa, escolha a estrutura Fazenda.',
  'mod.exterior.sakura.label': 'Casa Sakura',
  'mod.exterior.sakura.desc':
    'Um acabamento de chalé das cerejeiras: revestimento de madeira de cerejeira em rosa suave sobre uma base de pedra, um telhado escuro de ardósia e cascatas de flores rosadas escorrendo pelos beirais e pelos cantos frontais. Frondoso, romântico, primaveril — uma casa aninhada em um bosque de cerejeiras.',
  'mod.exterior.gothic.label': 'Gótica',
  'mod.exterior.gothic.desc':
    'Um acabamento de mansão sombria: tábuas de carvalho escuro enegrecidas sobre deepslate, um telhado íngreme de ardósia, lanternas com chama das almas, uma torre pontiaguda de canto que se ergue acima da linha do telhado e uma ala-jardim de inverno de vidro com janelas ao longo de um dos lados. Soturna, vertical e assimétrica.',

  // --- tunable params -------------------------------------------------------
  'param.floors.label': 'Andares',
  'param.balcony.label': 'Varanda',
  'param.balcony.opt.none': 'Nenhuma',
  'param.balcony.opt.front': 'Frente',
  'param.balcony.opt.side': 'Lateral',

  // --- rooms + furnishing presets -------------------------------------------
  // living
  'mod.room.living.label': 'Sala de estar',
  'mod.room.living.desc':
    'Uma sala de convívio organizada em torno de uma lareira: uma parede com lareira ou chaminé, um conjunto de assentos de "sofás" de escada sobre um tapete de lã, uma mesa baixa, prateleiras e quadros na parede, e luz ambiente aconchegante. O centro acolhedor da casa.',
  'room.living.snug.label': 'Cantinho de estar',
  'room.living.snug.summary': 'Um pequeno canto de estar: alguns assentos voltados para um único ponto focal.',
  'room.living.snug.f0': 'um único ponto focal — uma pequena lareira ou uma janela — em uma das paredes',
  'room.living.snug.f1': 'duas "cadeiras" de escada ou um sofá curto voltados para ele, sobre um pequeno tapete',
  'room.living.snug.f2': 'uma mesinha de apoio baixa com uma vela ou um vaso de planta',
  'room.living.snug.f3': 'um quadro ou um par de arandelas de parede',
  'room.living.standard.label': 'Sala de estar',
  'room.living.standard.summary': 'Uma lareira, um conjunto de assentos sobre um tapete, uma mesa de centro e prateleiras.',
  'room.living.standard.f0': 'uma lareira ou parede de destaque como ponto focal',
  'room.living.standard.f1': 'um conjunto de assentos voltado para ela — um sofá de 2–3 lugares mais uma poltrona sobre um tapete',
  'room.living.standard.f2': 'uma mesa de centro no meio com uma lanterna ou um vaso de flores',
  'room.living.standard.f3': 'estantes de livros e quadros enfeitando as paredes',
  'room.living.standard.f4': 'um vaso de planta em um canto e luz ambiente aconchegante',
  'room.living.grand.label': 'Grande salão',
  'room.living.grand.summary':
    'Um grande salão de duas zonas: uma sala de estar com lareira mais um segundo conjunto (leitura ou jogos), colunas e tapetes dividindo um piso amplo.',
  'room.living.grand.f0': 'uma imponente parede de lareira com uma cornija alta como ponto focal principal',
  'room.living.grand.f1': 'uma sala de estar generosa voltada para ela — um sofá grande, duas poltronas, uma mesa de centro, um tapete grande',
  'room.living.grand.f2': 'uma SEGUNDA zona do outro lado da sala — um canto de leitura, uma mesa de jogos/jantar ou um cantinho de piano',
  'room.living.grand.f3': 'colunas, um tapete corredor ou uma divisória de meia altura separando as duas zonas',
  'room.living.grand.f4': 'uma longa parede de prateleiras / exposição e vários quadros grandes na parede',
  'room.living.grand.f5': 'vasos de plantas, um lustre de lanternas suspensas e arandelas de parede por toda parte',

  // kitchen
  'mod.room.kitchen.label': 'Cozinha',
  'mod.room.kitchen.desc':
    'Uma cozinha funcional: uma bancada (lajes/escadas sobre barris, com um fogão de defumador/alto-forno e uma pia de caldeirão), armários superiores e de base feitos de barris e compostores, uma despensa e um pequeno canto de refeições. Funcional, iluminada e organizada.',
  'room.kitchen.snug.label': 'Quitinete',
  'room.kitchen.snug.summary': 'Uma bancada curta com fogão, pia e um pouco de armazenamento.',
  'room.kitchen.snug.f0': 'um pequeno L de bancadas (lajes/escadas sobre barris) em um canto',
  'room.kitchen.snug.f1': 'um defumador ou alto-forno embutido como fogão, mais uma pia de caldeirão',
  'room.kitchen.snug.f2': 'algumas prateleiras superiores e um ou dois barris para armazenamento',
  'room.kitchen.snug.f3': 'uma única lanterna de trabalho',
  'room.kitchen.standard.label': 'Cozinha',
  'room.kitchen.standard.summary': 'Uma bancada completa, uma despensa, armários superiores e um pequeno canto de refeições.',
  'room.kitchen.standard.f0': 'uma bancada ao longo de uma parede — fogão (defumador/alto-forno), área de preparo, pia de caldeirão',
  'room.kitchen.standard.f1': 'prateleiras superiores e armários de base de barris e compostores',
  'room.kitchen.standard.f2': 'um canto de despensa (barris empilhados + um baú)',
  'room.kitchen.standard.f3': 'um pequeno canto de refeições — uma mesa com duas cadeiras de escada',
  'room.kitchen.standard.f4': 'utensílios/panelas pendurados e iluminação de trabalho aconchegante',
  'room.kitchen.grand.label': 'Cozinha de fazenda',
  'room.kitchen.grand.summary':
    'Uma grande cozinha funcional com uma ilha central e uma mesa de jantar completa — bancadas em duas paredes, uma despensa ampla e nenhum piso vazio.',
  'room.kitchen.grand.f0': 'bancadas em duas paredes — um fogão (vários defumadores/fornos), uma longa área de preparo, uma pia dupla',
  'room.kitchen.grand.f1': 'uma ilha central ou bancada de açougueiro com bancos e panelas penduradas acima',
  'room.kitchen.grand.f2': 'uma mesa de jantar completa com cadeiras para a família, sobre um tapete',
  'room.kitchen.grand.f3': 'uma despensa ampla / área de copa com barris, baús e compostores do piso ao teto',
  'room.kitchen.grand.f4': 'um aparador/cristaleira exibindo louças, mais prateleiras superiores ao longo das bancadas',
  'room.kitchen.grand.f5': 'lanternas penduradas sobre a ilha e a mesa, ervas/utensílios nas paredes',

  // library
  'mod.room.library.label': 'Biblioteca',
  'mod.room.library.desc':
    'Uma sala de leitura tranquila: paredes forradas do piso ao teto com estantes de livros (interrompidas por algum armário envidraçado), uma mesa de estudo central com atris e velas, uma poltrona de leitura junto a uma janela e um lustre. Estudiosa e aconchegante.',
  'room.library.snug.label': 'Cantinho de leitura',
  'room.library.snug.summary': 'Uma parede de estantes, uma poltrona de leitura junto a uma janela, um atril.',
  'room.library.snug.f0': 'uma parede forrada de estantes de livros',
  'room.library.snug.f1': 'uma única poltrona de leitura (escada) com uma mesinha de apoio junto a uma janela',
  'room.library.snug.f2': 'um atril com uma vela',
  'room.library.snug.f3': 'uma lanterna suave no alto',
  'room.library.standard.label': 'Biblioteca',
  'room.library.standard.summary': 'Paredes de estantes, uma mesa de estudo central com atris, uma poltrona de leitura.',
  'room.library.standard.f0': 'duas ou três paredes forradas do piso ao teto com estantes (interrompidas por um armário envidraçado)',
  'room.library.standard.f1': 'uma mesa de estudo central com atris e velas',
  'room.library.standard.f2': 'uma poltrona de leitura e uma mesinha de apoio junto a uma janela',
  'room.library.standard.f3': 'um tapete sob a mesa e um lustre acima',
  'room.library.grand.label': 'Grande biblioteca',
  'room.library.grand.summary':
    'Um salão com ar de dois andares: paredes inteiras de estantes com galeria/escada, mesas de leitura e um canto de estudo com lareira.',
  'room.library.grand.f0': 'todas as paredes do piso ao teto em estantes, com uma escada de mão ou de degraus para as prateleiras de cima (ou uma passarela de galeria)',
  'room.library.grand.f1': 'estantes independentes dividindo o piso em corredores',
  'room.library.grand.f2': 'duas ou mais mesas de leitura com atris, mais uma longa mesa central',
  'room.library.grand.f3': 'um canto de estudo com lareira, poltronas e um tapete',
  'room.library.grand.f4': 'armários envidraçados para tomos especiais, globos/mapas em suportes',
  'room.library.grand.f5': 'um grande lustre e arandelas de parede iluminando todo o salão',

  // bedroom
  'mod.room.bedroom.label': 'Quarto',
  'mod.room.bedroom.desc':
    'Um quarto privativo individual: uma cama arrumada encostada na parede com cabeceira, uma mesa de cabeceira e lanterna, um guarda-roupa e um baú, um pequeno tapete, uma janela com cortina e uma escrivaninha opcional. Aconchegante e pessoal.',
  'room.bedroom.snug.label': 'Cantinho de cama',
  'room.bedroom.snug.summary': 'Uma cama de solteiro encaixada em um canto com o essencial — nada mais.',
  'room.bedroom.snug.f0': 'uma cama em um canto encostada na parede, com uma cabeceira simples acima',
  'room.bedroom.snug.f1': 'uma única mesa de cabeceira ao lado com uma lanterna ou vela',
  'room.bedroom.snug.f2': 'um pequeno baú ou barris empilhados para roupas',
  'room.bedroom.snug.f3': 'uma janela com cortina',
  'room.bedroom.standard.label': 'Quarto',
  'room.bedroom.standard.summary': 'Um quarto equilibrado: cama, mesas de cabeceira combinando, um guarda-roupa, um tapete e uma janela.',
  'room.bedroom.standard.f0': 'uma cama arrumada no centro de uma parede com cabeceira',
  'room.bedroom.standard.f1': 'uma mesa de cabeceira combinando e um abajur de cada lado da cama',
  'room.bedroom.standard.f2': 'um guarda-roupa / cômoda ao longo de outra parede (barris + um baú + portas emolduradas)',
  'room.bedroom.standard.f3': 'um tapete ao lado da cama definindo a zona de dormir',
  'room.bedroom.standard.f4': 'uma janela com cortina',
  'room.bedroom.standard.f5': 'uma pequena escrivaninha com um atril ou vela',
  'room.bedroom.grand.label': 'Suíte máster',
  'room.bedroom.grand.summary':
    'Uma grande suíte dividida em zonas: uma parede de destaque com cama de dossel, um corredor de guarda-roupa e um cantinho separado de estar/vestir, para que o piso nunca pareça vazio.',
  'room.bedroom.grand.f0': 'uma cama de dossel centralizada em uma parede de destaque, emoldurada por colunas altas',
  'room.bedroom.grand.f1': 'uma mesa de cabeceira com um abajur de cada lado e arte na parede acima da cabeceira',
  'room.bedroom.grand.f2': 'um longo corredor de guarda-roupa mais uma cômoda ao longo de uma parede',
  'room.bedroom.grand.f3': 'um tapete grande ancorando a zona da cama',
  'room.bedroom.grand.f4': 'um cantinho de estar separado junto à janela — duas cadeiras e uma mesinha, ou um canto de leitura',
  'room.bedroom.grand.f5': 'uma escrivaninha / penteadeira em seu próprio canto',
  'room.bedroom.grand.f6': 'pilares, um tapete corredor ou uma divisória baixa para dividir o piso aberto em zonas',
  'room.bedroom.grand.f7': 'quadros na parede, vasos de plantas nos cantos e lanternas suspensas para luz suave',

  // dormitory
  'mod.room.dormitory.label': 'Quartos (compartilhado)',
  'mod.room.dormitory.desc':
    'Um dormitório compartilhado com várias camas: uma fileira ou duas fileiras opostas de camas, cada uma com sua própria mesa de cabeceira e lanterna, divididas por divisórias baixas ou tapetes, uma parede de guarda-roupa comum e janelas ao longo do lado comprido. Um andar de estalagem, alojamento ou quarto de crianças.',
  'room.dormitory.snug.label': 'Quarto duplo',
  'room.dormitory.snug.summary': 'Duas camas compartilhando uma mesa de cabeceira — um pequeno quarto compartilhado.',
  'room.dormitory.snug.f0': 'duas camas ao longo de uma parede com uma mesa de cabeceira e lanterna compartilhadas entre elas',
  'room.dormitory.snug.f1': 'um único guarda-roupa comum (barris empilhados + um baú)',
  'room.dormitory.snug.f2': 'uma janela entre ou acima das camas',
  'room.dormitory.standard.label': 'Fileira de camas',
  'room.dormitory.standard.summary': 'Uma fileira de três ou quatro camas, cada uma com sua mesa de cabeceira, ao longo de uma parede.',
  'room.dormitory.standard.f0': 'uma fileira de 3–4 camas ao longo da parede comprida, cada uma com uma mesa de cabeceira e lanterna',
  'room.dormitory.standard.f1': 'divisórias baixas ou tapetes separando as camas',
  'room.dormitory.standard.f2': 'uma parede de guarda-roupa comum (barris, baús, portas emolduradas)',
  'room.dormitory.standard.f3': 'janelas ao longo do lado comprido acima das camas',
  'room.dormitory.grand.label': 'Salão dormitório',
  'room.dormitory.grand.summary':
    'Duas fileiras opostas de camas ao longo de um corredor central, zoneadas com divisórias — preenche um grande salão em vez de deixá-lo vazio.',
  'room.dormitory.grand.f0': 'duas fileiras opostas de camas (6 ou mais) ao longo das paredes compridas',
  'room.dormitory.grand.f1': 'um corredor central com um tapete corredor e lanternas suspensas no alto',
  'room.dormitory.grand.f2': 'uma divisória (parede, cerca ou prateleira) entre cada par de camas para privacidade',
  'room.dormitory.grand.f3': 'uma mesa de cabeceira e um pequeno baú ou arca aos pés de cada cama',
  'room.dormitory.grand.f4': 'um guarda-roupa compartilhado + canto de lavagem em uma extremidade (caldeirão, barris, um banco)',
  'room.dormitory.grand.f5': 'janelas ao longo das duas paredes compridas entre as camas',
  'room.dormitory.grand.f6': 'um elemento central — um fogão/braseiro ou um pilar — para ancorar o meio do piso',

  // storage
  'mod.room.storage.label': 'Depósito',
  'mod.room.storage.desc':
    'Um depósito utilitário: paredes de barris e baús empilhados, prateleiras, sacos e caixotes, ferramentas penduradas e uma única lanterna de trabalho. A despensa / quarto dos fundos onde a família guarda seus mantimentos.',
  'room.storage.snug.label': 'Despensa',
  'room.storage.snug.summary': 'Um pequeno armário de prateleiras e barris.',
  'room.storage.snug.f0': 'prateleiras e barris empilhados ao longo de uma ou duas paredes',
  'room.storage.snug.f1': 'alguns baús e um saco (compostor) no chão',
  'room.storage.snug.f2': 'uma única lanterna',
  'room.storage.standard.label': 'Almoxarifado',
  'room.storage.standard.summary': 'Paredes de barris e baús, prateleiras etiquetadas, sacos e caixotes.',
  'room.storage.standard.f0': 'paredes de barris e baús empilhados',
  'room.storage.standard.f1': 'prateleiras etiquetadas com molduras de itens',
  'room.storage.standard.f2': 'sacos e caixotes (compostores, barris) no chão',
  'room.storage.standard.f3': 'ferramentas penduradas e uma lanterna de trabalho',
  'room.storage.grand.label': 'Armazém',
  'room.storage.grand.summary':
    'Um estoque com fileiras de prateleiras / corredores, uma mesa de trabalho central e caixotes empilhados ao alto — um grande cômodo movimentado, não vazio.',
  'room.storage.grand.f0': 'fileiras de prateleiras independentes formando corredores pelo piso',
  'room.storage.grand.f1': 'paredes forradas do piso ao teto com barris e baús etiquetados',
  'room.storage.grand.f2': 'uma mesa de trabalho / bancada de triagem central com caixotes ao redor',
  'room.storage.grand.f3': 'caixotes e sacos empilhados (barris, compostores) preenchendo os cantos',
  'room.storage.grand.f4': 'ferramentas penduradas e uma escada de mão para as prateleiras altas',
  'room.storage.grand.f5': 'lanternas ao longo de cada corredor para iluminação uniforme',

  // --- AI providers (shared/ai.ts) ------------------------------------------
  'aiprov.claude-subscription.label': 'Claude (assinatura)',
  'aiprov.claude-subscription.blurb':
    'Funciona no seu plano Claude Pro/Max via Claude Code — sem créditos de API. Usa seu login existente do Claude Code ou um token do `claude setup-token`.',
  'aiprov.codex.label': 'Codex (ChatGPT)',
  'aiprov.codex.blurb':
    'Funciona no seu plano ChatGPT Plus/Pro via a CLI do Codex — sem créditos de API. Faça login primeiro com `codex login`. A revisão visual é feita na medida do possível.',

  // --- AI generation presets (shared/ai.ts) ---------------------------------
  'aipreset.balanced.label': 'Equilibrado',
  'aipreset.balanced.blurb':
    'A sequência completa de passes de design (rodadas ajustadas automaticamente ao tamanho da construção), raciocínio estendido e o crítico independente. A base de qualidade para construções de verdade.',
  'aipreset.thorough.label': 'Completo',
  'aipreset.thorough.blurb': 'Mais caro — um limite fixo alto de rodadas e o raciocínio mais profundo, além do crítico.',
  'aipreset.saver.label': 'Econômico',
  'aipreset.saver.blurb':
    'Mais barato — alguns passes rápidos, sem raciocínio estendido, sem crítico. Ideal para rascunhos rápidos.',
};
