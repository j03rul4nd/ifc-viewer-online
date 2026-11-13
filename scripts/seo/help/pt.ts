import type { HelpCopy } from './types'

export const pt: HelpCopy = {
  ui: {
    hub: 'Ajuda: receção de entregas IFC',
    hubIntro: 'Guias breves do espaço de trabalho pago: configurar um projeto, preparar os fornecedores, ler um veredicto, ligar as suas ferramentas e como os seus dados são guardados.',
    preview: 'Pré-visualização: estas funcionalidades ainda não estão abertas a registo. Os guias descrevem como funcionam hoje.',
    all: 'Todos os guias',
    home: 'IFC Viewer Online',
    pricing: 'Planos',
  },
  topics: {
    setup: {
      title: 'Configurar um projeto',
      desc: 'De um espaço de trabalho vazio à primeira entrega verificada, em cinco passos.',
      sections: [
        ['1. Criar o projeto', 'Um projeto é uma obra ou um contrato. Dê-lhe um nome, um código curto (2 a 6 letras maiúsculas, usado no início de cada nome de ficheiro) e a pontuação mínima de que uma entrega precisa. Pode alterar tudo mais tarde.'],
        ['2. Definir os requisitos', 'Escolha um modelo (um perfil EIR) ou carregue o seu próprio IDS. Os fornecedores são verificados face a ele antes de enviar, e novamente no servidor quando o ficheiro chega.'],
        ['3. Convidar os fornecedores', 'Cada fornecedor recebe a sua própria ligação de carregamento; não é preciso conta. A ligação é mostrada uma única vez: copie a mensagem preparada e envie-a a partir do seu próprio e-mail.'],
        ['4. Ligar uma pasta ou um webhook', 'As entregas também podem chegar de uma pasta vigiada do SharePoint ou do Drive, e cada veredicto pode ser enviado às suas ferramentas por webhook. Ambos são opcionais.'],
        ['5. Enviar uma entrega de teste', 'A lista de primeiros passos envia um IFC público pequeno pelas mesmas verificações por que passa o ficheiro de um fornecedor, para que veja um veredicto na caixa de entrada antes de alguém entregar.'],
      ],
    },
    suppliers: {
      title: 'Preparar os seus fornecedores',
      desc: 'O que um fornecedor vê, o que tem de acertar e o que significa cada erro.',
      sections: [
        ['A ligação deles', 'A ligação abre uma página com os requisitos do projeto, a regra de nomes de ficheiro e a próxima data de entrega. Qualquer pessoa com a ligação pode entregar em nome desse fornecedor, por isso não deve ser partilhada. Se for divulgada, crie uma nova a partir da ficha do fornecedor: a antiga deixa de funcionar de imediato.'],
        ['A verificação gratuita', 'Quando um fornecedor escolhe um ficheiro, este é verificado no seu próprio navegador: se é um IFC completo, a regra de nomes e a pontuação. Vê o que corrigir, com um guia gratuito para cada regra, antes de enviar o que quer que seja.'],
        ['O nome do ficheiro', 'Os nomes seguem a ISO 19650: código do projeto, código próprio do fornecedor, volume, piso, tipo, função, número, estado (S0 a S4) e revisão, por exemplo `TNO-ESTRUC-ZZ-02-M3-S-0001-S2-P01.ifc`. Um nome que viola a regra também é recusado pelo servidor.'],
        ['Quando algo falha', 'Demasiado grande: exporte sem elementos não utilizados ou divida o modelo. Não é um IFC: exporte novamente como IFC, pois um ficheiro nativo renomeado não funciona. Danificado: o ficheiro foi cortado durante a exportação ou a transferência, por isso exporte-o novamente. Demasiadas tentativas: aguarde um minuto; nada se perde.'],
      ],
    },
    verdict: {
      title: 'Ler um veredicto',
      desc: 'O estado do ficheiro, o veredicto automático e a sua revisão são três coisas diferentes.',
      sections: [
        ['O ficheiro', 'Cada entrega recebe primeiro um estado de ficheiro: ok, danificado (cortado ou não fechado, nunca pontuado), não é um IFC, ou não é o ficheiro declarado (o seu SHA-256 é diferente).'],
        ['O veredicto automático', 'Um ficheiro que abre é pontuado de 0 a 100 face aos seus requisitos. Se atingir ou superar o mínimo do projeto é aceite automaticamente; abaixo disso, é rejeitado com o motivo. Este veredicto é do servidor e é conservado.'],
        ['A sua revisão', 'Uma pessoa pode aceitar ou devolver qualquer entrega com um motivo, e essa decisão fica selada no registo com a impressão digital do ficheiro. Uma entrega não pode ser aceite antes de ser validada; devolvê-la antes continua a ser possível.'],
        ['O registo', 'Cada receção e decisão é guardada por ordem, com quem a fez e quando. Exporte-o a qualquer momento a partir do separador do projeto, como ZIP (JSON e CSV) ou JSON.'],
      ],
    },
    api: {
      title: 'API e webhooks',
      desc: 'Entregas, veredictos e eventos para as suas próprias ferramentas.',
      sections: [
        ['Entregas', 'A lista de entregas devolve, para cada uma, o estado do ficheiro, o veredicto automático (`auto`) e a revisão de uma pessoa (`review`) como campos separados. `verdict` continua a ser o valor efetivo para integrações mais antigas. O contrato completo está descrito em OpenAPI.'],
        ['Webhooks', 'Escolha os eventos (recebida, validada, aceite, devolvida) e um endereço https. Cada chamada é assinada com HMAC-SHA256 sobre o carimbo temporal e o corpo; o segredo é mostrado uma única vez. Endereços em redes privadas são recusados.'],
        ['Pastas vigiadas', 'Uma pasta do SharePoint ou do Drive pode entregar em nome de um fornecedor. Vários ficheiros são tratados em simultâneo, e o relatório é escrito junto a cada modelo. Um ficheiro que falhou na rede é tentado novamente na verificação seguinte.'],
        ['Limites', 'As páginas públicas permitem 60 pedidos por minuto por endereço, e a API com sessão iniciada permite 600 por minuto por utilizador. Acima disso, a resposta é um 429 com `Retry-After: 60`.'],
      ],
    },
    security: {
      title: 'Segurança e os seus dados',
      desc: 'Como os dados de cada empresa são mantidos separados e como retirá-los todos.',
      sections: [
        ['Cada empresa à parte', 'Cada consulta é filtrada por empresa, e a própria base de dados também o impõe (segurança ao nível da linha): uma empresa nunca lê nem altera os dados de outra, nem mesmo pedindo um id conhecido.'],
        ['Funções', 'Proprietários e administradores gerem pessoas, ligações de fornecedores, webhooks e a eliminação de projetos. Os editores revêem entregas, os revisores comentam e os leitores consultam. Um fornecedor só vê as suas próprias entregas.'],
        ['Registo de auditoria', 'Convidar ou revogar um fornecedor, decisões, ligações de cliente, webhooks, automatizações, funções, o logótipo, exportações e eliminações deixam cada um uma linha com quem o fez e quando.'],
        ['Retirar os dados', 'A partir do separador do projeto, exporte tudo (entregas com ambos os veredictos, o registo e as ocorrências) ou elimine o projeto. Eliminar exige escrever o nome do projeto, remove também os ficheiros e deixa apenas uma linha no registo de auditoria.'],
      ],
    },
  },
}
