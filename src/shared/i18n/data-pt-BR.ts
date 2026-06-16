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
  'group.tower': 'Torre',
  // --- room program families (groups) ---------------------------------------
  'group.general': 'Geral',
  'group.horror': 'Terror',

  // --- structure types ------------------------------------------------------
  'mod.structure.classic.label': 'Clássica',
  'mod.structure.classic.desc':
    'Uma casa de vários andares com telhado inclinado, pilares de canto emoldurados, uma porta central e janelas em faixa. Define toda a sua volumetria: porão opcional, 1–4 andares acima do solo, sótão opcional no telhado, um núcleo de escadas conectado e uma varanda coberta opcional. A decoração fornece os materiais e (opcionalmente) o desgaste.',
  'mod.structure.modern.label': 'Casa moderna',
  'mod.structure.modern.desc':
    'Uma vila contemporânea de telhado plano: volumes de concreto branco empilhados e deslocados, com andar superior recuado e terraço na cobertura, paredes-cortina de vidro do piso ao teto interrompidas por colunas escuras de destaque e guarda-corpos de vidro. A alternativa moderna à casa de telhado inclinado — combine com a decoração Moderna para materiais de branco e vidro.',
  'mod.structure.farmhouse.label': 'Fazenda',
  'mod.structure.farmhouse.desc':
    'Uma rústica casa de sítio: uma silhueta em L com telhado de duas águas cruzadas — nunca uma caixa — com uma varanda coberta e profunda sobre pilares de madeira e uma galeria superior na frente, um alpendre abrigado no canto, estrutura aparente de troncos escuros sobre uma base de pedra, um telhado escuro e íngreme de ardósia e uma chamine alta na empena. Espraiada, habitada, enraizada.',
  'mod.structure.sakura.label': 'Casa Sakura',
  'mod.structure.sakura.desc':
    'Um chalé das cerejeiras erguido sobre um porão de tijolos de pedra visível: a entrada fica no andar principal elevado, alcançada por uma escada externa de pedra que sobe por baixo do andar superior em balanço. Revestimento de madeira de cerejeira em rosa suave, um telhado de duas águas rosa coroado por cascatas de flores, floreiras frondosas e uma sacada frontal superior. Romântica e primaveril.',
  'mod.structure.gothic.label': 'Gótica',
  'mod.structure.gothic.desc':
    'Uma mansão gótica sombria: paredes enegrecidas de madeira e blackstone realçadas por cordões de pedra clara, um telhado íngreme de ardósia, uma torre central de fachada que se projeta à frente e se ergue acima da cumeeira até um remate pontiagudo, uma varanda frontal com balaustrada, uma mini torre de canto, uma ala-capela de vidro com altas janelas cinzas e heras pendendo dos beirais. Soturna, vertical e assimétrica — iluminada por almas e senhorial.',
  'mod.structure.tower-classic.label': 'Clássica',
  'mod.structure.tower-classic.desc':
    'Uma torre de menagem de pedra com ameias: um alto eixo quadrado de andares estreitos empilhados com janelas em fresta, uma porta arqueada assente sobre um embasamento de pedra, um núcleo de escadas em ziguezague conectado e um parapeito ameado coroando um terraço de cobertura praticável. Define a sua própria coroa em código (sem opção de telhado); liga-se a todos os módulos de Porão, Arredores e Cômodo. A decoração fornece os materiais.',
  'mod.structure.haunted-tower.label': 'Assombrada',
  'mod.structure.haunted-tower.desc':
    'Um pináculo gótico em ruínas: um embasamento alargado, um eixo nervurado verticalmente que recua em degraus à medida que se ergue, braços de lanterna em gaiola pendurados por correntes, um rosto de caveira esculpido numa frente larga, uma porta gótica em ogiva sob uma cruz invertida luminosa, janelas em fresta iluminadas pela chama das almas, contrafortes de canto de altura plena rematados por pináculos acesos e uma coroa de ameias espinhada. O exterior esculpido cresce com a largura — uma torre larga fica densamente articulada, nunca uma caixa. Define a sua própria coroa em código (sem opção de telhado); liga-se a todos os módulos de Porão, Arredores e Cômodo. Melhor com a decoração Assombrada.',

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
  'mod.decoration.sakura.label': 'Sakura',
  'mod.decoration.sakura.desc':
    'A paleta das cerejeiras: revestimento de madeira de cerejeira em rosa suave sobre uma base de tijolos de pedra clara, um telhado rosa de cerejeira coroado por flores, floreiras frondosas e luz quente de lanterna. Romântica e primaveril — combine com a estrutura Sakura para o chalé das flores completo erguido sobre seu porão de pedra visível.',
  'mod.decoration.gothic.label': 'Gótica',
  'mod.decoration.gothic.desc':
    'A paleta da mansão sombria: paredes de carvalho escuro e blackstone realçadas por detalhes de pedra polida clara, um telhado íngreme de ardósia deepslate, vidro de capela cinza e lanternas com chama das almas. Soturna, vertical e assimétrica — combine com a estrutura Gótica para a mansão completa com torre, pórtico e capela de vidro.',
  'mod.decoration.castle.label': 'Castelo',
  'mod.decoration.castle.desc':
    'Um visual de pedra lavrada e fortificada: tijolos de pedra cinza-claros sobre uma base de pedregulho, detalhes de pedra cinzelada, madeira escura de spruce e luz quente de lanternas. Alvenaria onde a Aconchegante é madeira. A pedra se desgasta para suas variantes com musgo e rachadas. O padrão da torre de menagem — combina com torres, muralhas e salões de pedra.',
  'mod.decoration.cursed.label': 'Amaldiçoada',
  'mod.decoration.cursed.desc':
    'A paleta da ruína gótica em pedra escura: um eixo de tijolos de blackstone realçado por cordões de pedra cinzelada e contrafortes de blackstone polido, fundações de pedregulho com musgo, vidro cinza encardido e a chama azul e fria das lanternas das almas. A contraparte em pedra da Assombrada — um monólito de blackstone em ruínas, não um chalé de madeira. A pedra se desgasta para suas variantes rachadas e com musgo, e ela se deteriora intensamente por padrão. Combine com a torre Assombrada; ideal para criptas, templos de culto e qualquer santuário de pedra amaldiçoado.',

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

  // --- surroundings ----------------------------------------------------------
  'mod.surroundings.modern.label': 'Moderno',
  'mod.surroundings.modern.desc':
    'O terreno da vila contemporânea envolvendo a casa: um muro moderno de pilares de concreto branco (com lanternas/lajes no topo) ligados por painéis de grade de ferro escura, com um portão alinhado à porta; um terraço de quartzo com uma piscina rebaixada e iluminada nas bordas e espreguiçadeiras; pátios laterais de quartzo; um caminho de entrada listrado de quartzo/concreto cinza-claro; canteiros elevados de lilás; e alguns poucos topiários como destaque. Paisagismo rígido e bem cuidado — limpo, nunca cheio de mato — e o mais elaborado dos quintais; escala com a casa, então uma vila maior ganha um lote mais denso. A caixa da construção cresce além do casco da casa para abrigar o anel.',
  'mod.surroundings.garden.label': 'Jardim',
  'mod.surroundings.garden.desc':
    'Um jardim de chácara cercado envolvendo a casa: um muro baixo de pedra coroado por uma cerca de madeira com postes de lampião em pedra, um portão de porta dupla alinhado com a entrada, um caminho de terra até a porta mais uma trilha contornando a casa, canteiros de flores ao longo da fachada, e uma mistura sorteada de elementos pelos gramados — uma fonte ou um poço de pedra, hortas aradas, um canteiro ornamental e arbustos aparados. O quintal escala com a casa — um lar maior ganha um terreno mais amplo — e o contorno chanfrado da cerca varia a cada semente, então o lote nunca é um retângulo puro. A caixa da construção cresce além do casco da casa para abrigar o quintal.',
  'mod.surroundings.graveyard.label': 'Cemitério',
  'mod.surroundings.graveyard.desc':
    'Um cemitério vasto e sombrio envolvendo a mansão gótica: um muro de pedra musgosa desmoronando, aberto em pontos e iluminado por lanternas das almas sobre pilares de pedra, um portão em arco alinhado com a entrada, uma longa alameda de cascalho ladeada por fileiras de lápides desgastadas, uma colunata em ruínas de pilares tombando e entulho, uma grande árvore-chorona como ponto focal, um pequeno mausoléu de pedra, e vegetação — samambaias, papoulas e folhas pendentes — reconquistando as ruínas. O terreno é deliberadamente imenso (cerca de quatro vezes um quintal comum) e voltado para a frente, então a mansão parece uma propriedade. A caixa da construção cresce bem além do casco da casa para abrigar o cemitério.',

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

  // --- rooms: horror set ----------------------------------------------------
  'mod.room.ritual.label': 'Câmara ritual',
  'mod.room.ritual.desc':
    'Uma câmara de invocação de culto: um círculo de selagem riscado no chão dentro de um anel de ' +
    'velas trêmulas, um altar de pedra para sacrifícios, braseiros nos cantos e prateleiras de ' +
    'reagentes em frascos. Sombria, enfumaçada e perversamente solene — a sala onde o rito é realizado.',
  'room.ritual.snug.label': 'Santuário oculto',
  'room.ritual.snug.summary': 'Um pequeno altar com velas, um sigilo riscado no chão, uma prateleira de reagentes.',
  'room.ritual.snug.f0': 'um altar de pedra baixo encostado na parede do fundo, coberto por um pano, com velas e um crânio em cima',
  'room.ritual.snug.f1': 'um pequeno sigilo riscado no chão à sua frente (incrustação de tapete/concreto) cercado por velas',
  'room.ritual.snug.f2': 'uma prateleira de reagentes — garrafas, um suporte de poções, um maço de ervas secas pendurado',
  'room.ritual.snug.f3': 'uma única fonte de luz fria e fraca para que as chamas das velas carreguem o clima',
  'room.ritual.standard.label': 'Câmara ritual',
  'room.ritual.standard.summary': 'Um círculo de selagem central cercado de velas, um altar de sacrifício, braseiros nos cantos.',
  'room.ritual.standard.f0': 'um CÍRCULO DE SELAGEM central incrustado no chão (um anel de blocos contrastantes com um sigilo no centro), debruado por velas',
  'room.ritual.standard.f1': 'um altar de pedra elevado à cabeceira do círculo — coberto por um pano, posto com candelabros, um livro ou relíquia acorrentado e os meios do sacrifício',
  'room.ritual.standard.f2': 'um braseiro (fogo em um caldeirão/bacia de ferro) em cada canto lançando luz baixa',
  'room.ritual.standard.f3': 'uma parede de prateleiras de reagentes — frascos, suportes de poções, maços pendurados, alguns espécimes engaiolados',
  'room.ritual.standard.f4': 'grupos de velas com cera escorrida e correntes nas paredes; mantenha a sala enfumaçada e mal iluminada',
  'room.ritual.grand.label': 'Santuário de culto',
  'room.ritual.grand.summary':
    'Um salão com colunas e um grande pentagrama, um estrado de altar em degraus, bancos para os fiéis, ' +
    'gaiolas suspensas e braseiros.',
  'room.ritual.grand.f0': 'um GRANDE SIGILO preenchendo o piso — um pentagrama/círculo de múltiplos anéis de blocos incrustados com pilares de velas em cada vértice',
  'room.ritual.grand.f1': 'um ESTRADO DE ALTAR elevado e em degraus à cabeceira do salão: um grande altar coberto por pano com um candelabro imponente e um ídolo ou relíquia acorrentado acima',
  'room.ritual.grand.f2': 'fileiras de BANCOS ou assentos de joelhos voltados para o estrado, divididos por um corredor central de procissão',
  'room.ritual.grand.f3': 'colunas laterais penduradas com correntes, estandartes e arandelas de ferro; braseiros rituais dos dois lados',
  'room.ritual.grand.f4': 'gaiolas de ferro suspensas e uma laje de sacrifício a um lado; nichos de parede com crânios e frascos de reagentes',
  'room.ritual.grand.f5': 'luz superior fria e esparsa para que as chamas das velas e o fogo dos braseiros dominem — penumbra com ilhas de brilho',

  'mod.room.dungeon.label': 'Masmorra',
  'mod.room.dungeon.desc':
    'Uma masmorra de tortura e bloco de celas: celas gradeadas de ferro com palha e correntes na parede, ' +
    'um potro central e uma bancada de ferramentas cruéis, gaiolas suspensas e um ralo gradeado no chão. ' +
    'Úmida, fria e iluminada apenas por tochas trêmulas — confinamento e crueldade em pedra.',
  'room.dungeon.snug.label': 'Cela',
  'room.dungeon.snug.summary': 'Uma única cela gradeada com palha e correntes, uma porta gradeada, uma tocha baixa.',
  'room.dungeon.snug.f0': 'uma pequena cela isolada com grades de ferro e uma porta gradeada',
  'room.dungeon.snug.f1': 'palha/feno no chão da cela, um balde de madeira e grilhões acorrentados à parede',
  'room.dungeon.snug.f2': 'um banquinho de guarda e um pequeno suporte de ferramentas do lado de fora das grades',
  'room.dungeon.snug.f3': 'uma única tocha baixa e fria — mantenha os cantos escuros',
  'room.dungeon.standard.label': 'Câmara de tortura',
  'room.dungeon.standard.summary': 'Um par de celas gradeadas, um potro central, uma bancada de ferramentas, um ralo no chão.',
  'room.dungeon.standard.f0': 'duas CELAS gradeadas ao longo de uma parede, cada uma com palha, grilhões na parede e uma porta gradeada',
  'room.dungeon.standard.f1': 'um POTRO ou mesa de tortura central — uma armação com correntes nas duas pontas, manchada e sinistra',
  'room.dungeon.standard.f2': 'uma bancada de ferramentas do carrasco (uma bigorna, um rebolo, instrumentos pendurados, um braseiro de brasas)',
  'room.dungeon.standard.f3': 'um RALO gradeado embutido no chão no ponto mais baixo da sala',
  'room.dungeon.standard.f4': 'correntes na parede, uma gaiola de ferro suspensa e tochas trêmulas esparsas para uma luz fria e irregular',
  'room.dungeon.grand.label': 'Bloco de masmorra',
  'room.dungeon.grand.summary':
    'Um corredor de celas, vários instrumentos de tortura, uma gaiola suspensa, um poço-ralo central, ' +
    'a estação do carrasco.',
  'room.dungeon.grand.f0': 'um CORREDOR ladeado por celas gradeadas dos dois lados, cada uma com porta gradeada, palha e grilhões na parede',
  'room.dungeon.grand.f1': 'uma fileira de INSTRUMENTOS DE TORTURA no espaço central aberto — um potro, um pelourinho/tronco, uma roda, uma gaiola de ferro suspensa',
  'room.dungeon.grand.f2': 'a ESTAÇÃO do carrasco: uma bancada de ferramentas pesada, uma bigorna e um rebolo, um braseiro de carvão, armas e correntes em uma parede de ganchos',
  'room.dungeon.grand.f3': 'um POÇO-RALO central ou canaleta gradeada correndo ao longo do chão',
  'room.dungeon.grand.f4': 'alguns barris, um caldeirão de água e ossos espalhados pelas celas',
  'room.dungeon.grand.f5': 'arandelas de ferro e tochas trêmulas distantes umas das outras para que a maior parte do bloco fique na sombra',

  'mod.room.morgue.label': 'Necrotério',
  'mod.room.morgue.desc':
    'Um necrotério e sala de embalsamamento: corpos cobertos por lençóis em lajes frias, uma parede de ' +
    'gavetas de cadáver, uma mesa de embalsamamento posta com frascos e instrumentos, caixões e potes de ' +
    'espécimes. Clínico, frio e silenciosamente horrível — onde os mortos são guardados e preparados.',
  'room.morgue.snug.label': 'Canto de embalsamamento',
  'room.morgue.snug.summary': 'Uma laje com um corpo coberto, uma prateleira de frascos, um caixão em pé, uma luz fraca.',
  'room.morgue.snug.f0': 'uma única LAJE fria (uma mesa de pedra/quartzo) com um corpo coberto por um lençol em cima',
  'room.morgue.snug.f1': 'uma pequena bandeja de instrumentos e uma prateleira de garrafas e potes ao lado',
  'room.morgue.snug.f2': 'um caixão vazio em pé encostado na parede',
  'room.morgue.snug.f3': 'uma bacia de lavagem/caldeirão e uma luz fraca e estéril',
  'room.morgue.standard.label': 'Necrotério',
  'room.morgue.standard.summary': 'Uma fileira de lajes com lençóis, uma mesa de embalsamamento, gavetas de parede, um caixão aberto.',
  'room.morgue.standard.f0': 'uma FILEIRA de lajes frias pela sala, com corpos cobertos em algumas delas',
  'room.morgue.standard.f1': 'uma MESA DE EMBALSAMAMENTO com garrafas, uma bandeja de instrumentos, suportes de poções e uma bacia de lavagem',
  'room.morgue.standard.f2': 'uma parede de GAVETAS DE CADÁVER (uma grade de compartimentos com frentes e puxadores)',
  'room.morgue.standard.f3': 'um caixão aberto sobre cavaletes e uma pilha de tampas reservas',
  'room.morgue.standard.f4': 'iluminação superior fria (lanternas atrás de grades de ferro/foscas), um ralo gradeado no chão',
  'room.morgue.grand.label': 'Salão mortuário',
  'room.morgue.grand.summary':
    'Uma parede de gavetas de corpos, várias lajes de autópsia, uma estação de embalsamamento central, ' +
    'caixões empilhados, armários de vidro com espécimes.',
  'room.morgue.grand.f0': 'uma PAREDE DE GAVETAS completa — uma grade alta de compartimentos de cadáver, um par deles entreaberto',
  'room.morgue.grand.f1': 'várias LAJES DE AUTÓPSIA dispostas em grade, com corpos cobertos, lâmpadas suspensas e um ralo sob cada uma',
  'room.morgue.grand.f2': 'uma ESTAÇÃO DE EMBALSAMAMENTO central: uma longa mesa de garrafas, fluidos, bandejas de instrumentos, suportes de poções e bacias',
  'room.morgue.grand.f3': 'uma área de caixões — caixões sobre cavaletes e reservas empilhadas, algumas tampas encostadas de lado',
  'room.morgue.grand.f4': 'ARMÁRIOS de vidro com potes de espécimes (órgãos/curiosidades) e prateleiras de garrafas etiquetadas',
  'room.morgue.grand.f5': 'uma mesa de registro com um livro-razão e vela; luz fria, uniforme e estéril com uma canaleta gradeada central',

  'mod.room.seance.label': 'Sala de sessão',
  'mod.room.seance.desc':
    'Uma sala de sessão espírita vitoriana e estúdio oculto: uma mesa redonda posta para contatar os mortos ' +
    'sob um candelabro baixo, cortinas pesadas, armários de curiosidades, um canto de leitura de cristal, ' +
    'taxidermia e prateleiras de grimórios. Refinada por fora, profundamente inquietante por baixo.',
  'room.seance.snug.label': 'Canto de leitura',
  'room.seance.snug.summary': 'Uma pequena mesa redonda com duas cadeiras, velas centrais, cortinas fechadas, uma prateleira de curiosidades.',
  'room.seance.snug.f0': 'uma pequena MESA REDONDA com duas cadeiras frente a frente e um grupo de velas em seu centro',
  'room.seance.snug.f1': 'um objeto de adivinhação sobre a mesa — uma peça de leitura de cristal (uma haste de cristal / vidro) ou um tabuleiro espírita incrustado',
  'room.seance.snug.f2': 'cortinas pesadas fechadas sobre a janela e um pequeno tapete sob os pés',
  'room.seance.snug.f3': 'uma prateleira de curiosidades — um crânio, frascos, um grimório — e uma luz de velas baixa, quente porém sinistra',
  'room.seance.standard.label': 'Sala de sessão',
  'room.seance.standard.summary': 'Uma mesa redonda central cercada de cadeiras, um candelabro suspenso, armários de curiosidades, uma lareira.',
  'room.seance.standard.f0': 'uma MESA REDONDA central cercada de cadeiras, velas no centro e um tabuleiro espírita / cristal como peça central',
  'room.seance.standard.f1': 'um CANDELABRO baixo suspenso diretamente sobre a mesa (lanternas/velas em uma armação de corrente)',
  'room.seance.standard.f2': 'ARMÁRIOS DE CURIOSIDADES contra as paredes — vitrines de frascos, ossos, relíquias e excentricidades',
  'room.seance.standard.f3': 'uma lareira com uma poltrona de orelhas, um grande tapete e cortinas pesadas até o chão sobre as janelas',
  'room.seance.standard.f4': 'uma prateleira de grimórios, uma peça de taxidermia montada, arandelas de parede atenuadas para a sessão',
  'room.seance.grand.label': 'Salão oculto',
  'room.seance.grand.summary':
    'Uma grande mesa de sessão sob um enorme candelabro, paredes de armários de curiosidades e grimórios, ' +
    'um nicho de leitura de cristal, uma sala de estar com lareira, espelhos e cortinas.',
  'room.seance.grand.f0': 'uma GRANDE MESA REDONDA ao centro, muitas cadeiras ao redor, uma peça central elaborada (tabuleiro espírita, cristal, anel de velas)',
  'room.seance.grand.f1': 'um grande CANDELABRO/lustre de velas acima dela, lançando uma única poça de luz',
  'room.seance.grand.f2': 'paredes de ARMÁRIOS — vitrines de espécimes e relíquias, mais estantes de grimórios do piso ao teto com uma escada de mão',
  'room.seance.grand.f3': 'um NICHO DE LEITURA DE CRISTAL: uma mesa lateral coberta com uma esfera brilhante, almofadas e uma cadeira de vidente',
  'room.seance.grand.f4': 'uma SALA DE ESTAR com lareira — poltronas de orelhas, uma chaise, um grande tapete estampado — reservada para receber visitas',
  'room.seance.grand.f5': 'espelhos altos cobertos, taxidermia montada e retratos cujos olhos parecem seguir você; cortinas pesadas e arandelas atenuadas por toda parte',

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
