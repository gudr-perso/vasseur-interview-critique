import { z } from 'zod'

// Messages de validation en français, montrés tels quels à l'admin et à Claude.
// Tout le serveur importe `z` d'ici : la configuration est faite avant le premier schéma.
z.config(z.locales.fr())

export { z }
