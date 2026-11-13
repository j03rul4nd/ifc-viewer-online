import type { HelpCopy } from './types'

export const es: HelpCopy = {
  ui: {
    hub: 'Ayuda: recepción de entregas IFC',
    hubIntro: 'Guías breves del espacio de trabajo de pago: configurar un proyecto, preparar a los proveedores, leer un veredicto, conectar sus herramientas y cómo se guardan sus datos.',
    preview: 'Vista previa: estas funciones aún no están abiertas al registro. Las guías describen cómo funcionan hoy.',
    all: 'Todas las guías',
    home: 'IFC Viewer Online',
    pricing: 'Planes',
  },
  topics: {
    setup: {
      title: 'Configurar un proyecto',
      desc: 'De un espacio de trabajo vacío a la primera entrega comprobada, en cinco pasos.',
      sections: [
        ['1. Crear el proyecto', 'Un proyecto es una obra o un contrato. Póngale un nombre, un código corto (de 2 a 6 letras mayúsculas, usado al inicio de cada nombre de fichero) y la puntuación mínima que necesita una entrega. Puede cambiarlo todo más adelante.'],
        ['2. Definir los requisitos', 'Elija una plantilla (un perfil EIR) o suba su propio IDS. Los proveedores se comprueban contra él antes de enviar, y de nuevo en el servidor cuando llega el fichero.'],
        ['3. Invitar a los proveedores', 'Cada proveedor recibe su propio enlace de subida; no necesita cuenta. El enlace se muestra una sola vez: copie el mensaje preparado y envíelo desde su propio correo.'],
        ['4. Conectar una carpeta o un webhook', 'Las entregas también pueden llegar desde una carpeta vigilada de SharePoint o Drive, y cada veredicto puede enviarse a sus herramientas por webhook. Ambas opciones son opcionales.'],
        ['5. Enviar una entrega de prueba', 'La lista de primeros pasos envía un IFC público pequeño por las mismas comprobaciones que el fichero de un proveedor, de modo que ve un veredicto en la bandeja antes de que nadie entregue.'],
      ],
    },
    suppliers: {
      title: 'Preparar a sus proveedores',
      desc: 'Qué ve un proveedor, qué debe hacer bien y qué significa cada error.',
      sections: [
        ['Su enlace', 'El enlace abre una página con los requisitos del proyecto, la regla de nombres de fichero y la próxima fecha de entrega. Cualquiera con el enlace puede entregar en nombre de ese proveedor, así que no debe compartirse. Si se filtra, cree uno nuevo desde la ficha del proveedor: el anterior deja de funcionar al instante.'],
        ['La comprobación gratuita', 'Cuando un proveedor elige un fichero, se comprueba en su propio navegador: si es un IFC completo, la regla de nombres y la puntuación. Ve qué corregir, con una guía gratuita para cada regla, antes de enviar nada.'],
        ['El nombre del fichero', 'Los nombres siguen ISO 19650: código de proyecto, código propio del proveedor, volumen, nivel, tipo, función, número, estado (S0 a S4) y revisión, por ejemplo `TNO-ESTRUC-ZZ-02-M3-S-0001-S2-P01.ifc`. Un nombre que incumple la regla también lo rechaza el servidor.'],
        ['Cuando algo falla', 'Demasiado grande: exporte sin elementos no usados o divida el modelo. No es un IFC: exporte de nuevo como IFC, ya que un fichero nativo renombrado no sirve. Dañado: el fichero se cortó durante la exportación o la descarga, así que expórtelo de nuevo. Demasiados intentos: espere un minuto; no se pierde nada.'],
      ],
    },
    verdict: {
      title: 'Leer un veredicto',
      desc: 'El estado del fichero, el veredicto automático y su revisión son tres cosas distintas.',
      sections: [
        ['El fichero', 'Cada entrega recibe primero un estado de fichero: correcto, dañado (cortado o sin cerrar, nunca se puntúa), no es un IFC, o no es el fichero declarado (su SHA-256 no coincide).'],
        ['El veredicto automático', 'Un fichero que se abre se puntúa de 0 a 100 frente a sus requisitos. Si alcanza o supera el mínimo del proyecto se acepta automáticamente; por debajo, se rechaza con el motivo. Este veredicto es del servidor y se conserva.'],
        ['Su revisión', 'Una persona puede aceptar o devolver cualquier entrega con un motivo, y esa decisión queda sellada en el registro con la huella del fichero. Una entrega no puede aceptarse antes de validarse; devolverla antes sigue siendo posible.'],
        ['El registro', 'Cada recepción y decisión se guarda en orden, con quién la hizo y cuándo. Expórtelo en cualquier momento desde la pestaña del proyecto, como ZIP (JSON y CSV) o JSON.'],
      ],
    },
    api: {
      title: 'API y webhooks',
      desc: 'Entregas, veredictos y eventos para sus propias herramientas.',
      sections: [
        ['Entregas', 'La lista de entregas devuelve, para cada una, el estado del fichero, el veredicto automático (`auto`) y la revisión de una persona (`review`) como campos separados. `verdict` sigue siendo el valor efectivo para integraciones anteriores. El contrato completo se describe en OpenAPI.'],
        ['Webhooks', 'Elija los eventos (recibida, validada, aceptada, devuelta) y una dirección https. Cada llamada se firma con HMAC-SHA256 sobre la marca de tiempo y el cuerpo; el secreto se muestra una sola vez. Las direcciones de redes privadas se rechazan.'],
        ['Carpetas vigiladas', 'Una carpeta de SharePoint o Drive puede entregar en nombre de un proveedor. Se procesan varios ficheros a la vez, y el informe se escribe junto a cada modelo. Un fichero que falló por la red se reintenta en la siguiente comprobación.'],
        ['Límites', 'Las páginas públicas permiten 60 peticiones por minuto por dirección, y la API con sesión iniciada permite 600 por minuto por usuario. Por encima, la respuesta es un 429 con `Retry-After: 60`.'],
      ],
    },
    security: {
      title: 'Seguridad y sus datos',
      desc: 'Cómo se mantienen separados los datos de cada empresa y cómo sacarlos todos.',
      sections: [
        ['Cada empresa por separado', 'Cada consulta se filtra por empresa, y la propia base de datos también lo impone (seguridad a nivel de fila): una empresa nunca lee ni cambia los datos de otra, ni siquiera pidiendo un id conocido.'],
        ['Roles', 'Propietarios y administradores gestionan personas, enlaces de proveedores, webhooks y el borrado de proyectos. Los editores revisan entregas, los revisores comentan y los lectores consultan. Un proveedor solo ve sus propias entregas.'],
        ['Registro de auditoría', 'Invitar o revocar a un proveedor, decisiones, enlaces de cliente, webhooks, automatizaciones, roles, el logotipo, exportaciones y borrados dejan cada uno una línea con quién lo hizo y cuándo.'],
        ['Sacar los datos', 'Desde la pestaña del proyecto, exporte todo (entregas con ambos veredictos, el registro y las incidencias) o borre el proyecto. Borrar exige escribir el nombre del proyecto, elimina también los ficheros y deja solo una línea en el registro de auditoría.'],
      ],
    },
  },
}
