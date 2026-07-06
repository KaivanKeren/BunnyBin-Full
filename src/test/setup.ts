import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// RTL auto-cleanup butuh Vitest globals; kita tidak memakainya, jadi manual.
afterEach(cleanup);
