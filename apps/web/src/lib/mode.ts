/** "local": la página funciona sin servidor (GitHub Pages) y guarda los datos en el navegador. */
export const LOCAL_MODE = import.meta.env.VITE_DATA_MODE === "local";

/** Ruta base donde se publica la aplicación (por ejemplo "/tomas-page" en GitHub Pages). */
export const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, "");
