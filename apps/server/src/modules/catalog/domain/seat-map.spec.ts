import {
  seatMapCapacity,
  sectionCapacity,
  type SectionCapacity,
} from './seat-map';

const seated = (seatCount: number): SectionCapacity => ({
  kind: 'seated',
  capacity: null,
  seatCount,
});

const generalAdmission = (capacity: number | null): SectionCapacity => ({
  kind: 'general_admission',
  capacity,
  seatCount: 0,
});

describe('sectionCapacity', () => {
  it('counts the seats of a seated section', () => {
    expect(sectionCapacity(seated(180))).toBe(180);
  });

  it('reads the counter of a general-admission section', () => {
    expect(sectionCapacity(generalAdmission(15000))).toBe(15000);
  });

  it('treats a half-built seated section as empty rather than invalid', () => {
    expect(sectionCapacity(seated(0))).toBe(0);
  });

  it('ignores a stored capacity on a seated section', () => {
    // The column is NULL for seated sections by CHECK constraint; if one ever
    // arrives populated, the seats are still the answer.
    expect(
      sectionCapacity({ kind: 'seated', capacity: 999, seatCount: 12 }),
    ).toBe(12);
  });

  it('survives a general-admission section with no capacity set', () => {
    expect(sectionCapacity(generalAdmission(null))).toBe(0);
  });
});

describe('seatMapCapacity', () => {
  it('sums both kinds of section', () => {
    expect(
      seatMapCapacity([seated(180), seated(84), generalAdmission(3000)]),
    ).toBe(3264);
  });

  it('is zero for a seat map with no sections', () => {
    expect(seatMapCapacity([])).toBe(0);
  });
});
