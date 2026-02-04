import { Router, type Request, type Response } from 'express';

export const privacyRouter = Router();

privacyRouter.get('/', (_req: Request, res: Response) => {
  res.type('text/plain').send(`Aviso de privacidad

Este chatbot utiliza WhatsApp para atender tus solicitudes. Los datos que compartas (como tu número, nombre y mensajes) se usarán únicamente para brindar soporte, dar seguimiento a tu solicitud y mejorar la calidad del servicio.

No compartimos tu información con terceros ajenos al servicio, salvo obligación legal o requerimiento de autoridad. Conservaremos los datos solo el tiempo necesario para cumplir con la finalidad descrita.

Puedes solicitar la actualización o eliminación de tus datos escribiéndonos por este mismo canal.
`);
});
