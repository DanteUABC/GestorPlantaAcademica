import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
    hasOverlap,
    timeToMinutes,
    OverlapValidationError,
    TeacherRestrictionConflictError,
    validateTeacherRestrictions
} = require('../../src/utils/overlapValidator');

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

describe('Unitarias: Motor Anti-Empalmes con Restricciones de Horario (Inclusión Total, Cruce Parcial y Horarios Contiguos)', () => {
    it('Inclusión total: clase 15:00-17:00 dentro de bloqueo 14:00-18:00 debe retornar conflicto', async () => {
        const clase = { day_of_week: 'Lunes', start_time: '15:00', end_time: '17:00' };
        const bloqueo = { day_of_week: 'Lunes', start_time: '14:00', end_time: '18:00' };

        // Validación matemática directa con desigualdades estrictas (< y >)
        expect(timeToMinutes(clase.start_time) < timeToMinutes(bloqueo.end_time)).toBe(true);
        expect(timeToMinutes(clase.end_time) > timeToMinutes(bloqueo.start_time)).toBe(true);
        expect(hasOverlap(clase, bloqueo)).toBe(true);
        expect(hasOverlap(bloqueo, clase)).toBe(true);

        // Validación contra validateTeacherRestrictions
        const mockDb = {
            query: vi.fn().mockResolvedValue({
                rows: [
                    {
                        id: 'restr-inc-1',
                        tenant_id: 'tenant-1',
                        teacher_id: 'teach-1',
                        day_of_week: 'Lunes',
                        start_time: '14:00',
                        end_time: '18:00',
                        reason: 'Posgrado',
                        teacher_name: 'Dra. Laura',
                        teacher_lastname: 'Gómez'
                    }
                ]
            })
        };

        await expect(
            validateTeacherRestrictions(
                {
                    tenant_id: 'tenant-1',
                    teacher_id: 'teach-1',
                    day_of_week: 'Lunes',
                    start_time: '15:00',
                    end_time: '17:00'
                },
                mockDb
            )
        ).rejects.toThrow(TeacherRestrictionConflictError);

        try {
            await validateTeacherRestrictions(
                {
                    tenant_id: 'tenant-1',
                    teacher_id: 'teach-1',
                    day_of_week: 'Lunes',
                    start_time: '15:00',
                    end_time: '17:00'
                },
                mockDb
            );
        } catch (err) {
            expect(err.conflictType).toBe('TEACHER_RESTRICTION');
            expect(err.status).toBe(409);
            expect(err.restriction).toMatchObject({
                day_of_week: 'Lunes',
                start_time: '14:00',
                end_time: '18:00',
                reason: 'Posgrado'
            });
        }
    });

    it('Cruce parcial: clase 13:00-15:00 y bloqueo 14:00-16:00 debe retornar conflicto', async () => {
        const clase = { day_of_week: 'Martes', start_time: '13:00', end_time: '15:00' };
        const bloqueo = { day_of_week: 'Martes', start_time: '14:00', end_time: '16:00' };

        expect(hasOverlap(clase, bloqueo)).toBe(true);
        expect(hasOverlap(bloqueo, clase)).toBe(true);

        const mockDb = {
            query: vi.fn().mockResolvedValue({
                rows: [
                    {
                        id: 'restr-par-1',
                        tenant_id: 'tenant-1',
                        teacher_id: 'teach-1',
                        day_of_week: 'Martes',
                        start_time: '14:00',
                        end_time: '16:00',
                        reason: 'Reunión departamental',
                        teacher_name: 'Dr. Carlos',
                        teacher_lastname: 'Ruiz'
                    }
                ]
            })
        };

        await expect(
            validateTeacherRestrictions(
                {
                    tenant_id: 'tenant-1',
                    teacher_id: 'teach-1',
                    day_of_week: 'Martes',
                    start_time: '13:00',
                    end_time: '15:00'
                },
                mockDb
            )
        ).rejects.toThrow(TeacherRestrictionConflictError);
    });

    it('Caso de frontera "Horarios Contiguos": bloqueo 08:00 a 10:00 y clase 10:00 a 12:00 NO debe marcarse como conflicto', async () => {
        const bloqueo = { day_of_week: 'Lunes', start_time: '08:00', end_time: '10:00' };
        const claseDespues = { day_of_week: 'Lunes', start_time: '10:00', end_time: '12:00' };
        const claseAntes = { day_of_week: 'Lunes', start_time: '06:00', end_time: '08:00' };

        // Desigualdades estrictas (< y >): 10:00 < 10:00 es false -> sin conflicto
        expect(hasOverlap(bloqueo, claseDespues)).toBe(false);
        expect(hasOverlap(claseDespues, bloqueo)).toBe(false);
        expect(hasOverlap(bloqueo, claseAntes)).toBe(false);
        expect(hasOverlap(claseAntes, bloqueo)).toBe(false);

        // Incluso si el cliente de BD simulado devolviera el registro 08:00-10:00, el filtro estricto (< y >) lo descarta
        const mockDb = {
            query: vi.fn().mockResolvedValue({
                rows: [
                    {
                        id: 'restr-cont-1',
                        tenant_id: 'tenant-1',
                        teacher_id: 'teach-1',
                        day_of_week: 'Lunes',
                        start_time: '08:00',
                        end_time: '10:00',
                        reason: 'Comisión académica',
                        teacher_name: 'Dr. Carlos',
                        teacher_lastname: 'Ruiz'
                    }
                ]
            })
        };

        const resultAfter = await validateTeacherRestrictions(
            {
                tenant_id: 'tenant-1',
                teacher_id: 'teach-1',
                day_of_week: 'Lunes',
                start_time: '10:00',
                end_time: '12:00'
            },
            mockDb
        );
        expect(resultAfter).toBeNull();

        const resultBefore = await validateTeacherRestrictions(
            {
                tenant_id: 'tenant-1',
                teacher_id: 'teach-1',
                day_of_week: 'Lunes',
                start_time: '06:00',
                end_time: '08:00'
            },
            mockDb
        );
        expect(resultBefore).toBeNull();
    });
});
