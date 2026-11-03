// Millennium: Starlight does not define ROLLUP_ENV; use the production environment shim.
import { process } from '../../frontend/shims/decky-env';
export default (...params: any[]) => {
  if (process.env.ROLLUP_ENV !== 'production') window.console['log']('%c ·SGDB· ', 'background: #000; color: #4e9ac6; font-weight: 600', ...params);
};