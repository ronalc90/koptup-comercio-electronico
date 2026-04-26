/**
 * Vitest setup: limpia localStorage entre tests para que los tests de
 * workdayArchive y otros que leen/escriben storage sean independientes.
 */
import { beforeEach } from 'vitest';

beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
