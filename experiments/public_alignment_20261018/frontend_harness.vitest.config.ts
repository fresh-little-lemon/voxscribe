import {defineConfig} from '../../frontend/node_modules/vitest/dist/config.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
export default defineConfig({
 root,
 resolve:{alias:{react:root+'frontend/node_modules/react','@testing-library/react':root+'frontend/node_modules/@testing-library/react/dist/index.js',vitest:root+'frontend/node_modules/vitest/dist/index.js'}},
 esbuild:{jsx:'automatic'},
 test:{environment:'jsdom',include:['experiments/public_alignment_20261018/frontend_harness.test.ts'],testTimeout:15000},
});
