import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { hasOverlap, OverlapValidationError } = require('../../src/utils/overlapValidator');

describe('Unitarias: overlapValidator.hasOverlap', () => {
    it('Dada una asignación empalmada, retorna true', () => {
        const a = { day_of_week: 'Lunes', start_time: '08:00', end_time: '10:00' };
        const b = { day_of_week: 'Lunes', start_time: '09:00', end_time: '11:00' };

        expect(hasOverlap(a, b)).toBe(true);
        expect(hasOverlap(b, a)).toBe(true); // simétrica
    });

    it('Dadas asignaciones continuas sin empalme, retorna false', () => {
        const a = { day_of_week: 'Lunes', start_time: '08:00', end_time: '09:00' };
        const b = { day_of_week: 'Lunes', start_time: '09:00', end_time: '10:00' };

        expect(hasOverlap(a, b)).toBe(false);
        expect(hasOverlap(b, a)).toBe(false);
    });

    it('Dados datos vacíos o inválidos, lanza una excepción controlada', () => {
        const valido = { start_time: '08:00', end_time: '09:00' };

        expect(() => hasOverlap(null, valido)).toThrow(OverlapValidationError);
        expect(() => hasOverlap(valido, {})).toThrow(OverlapValidationError);
        expect(() => hasOverlap(valido, { start_time: '', end_time: '' })).toThrow(OverlapValidationError);
        expect(() => hasOverlap(valido, { start_time: '25:00', end_time: '26:00' })).toThrow('Formato de hora inválido');
        expect(() => hasOverlap(valido, { start_time: '10:00', end_time: '09:00' })).toThrow('hora de inicio debe ser anterior');
    });
});
