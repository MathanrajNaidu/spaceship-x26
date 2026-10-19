import { describe, expect, it } from 'vitest';

import { CrewLead } from '../../../src/domain/crew/CrewLead.js';
import { CrewRoster } from '../../../src/domain/crew/CrewRoster.js';
import { CrewRosterInvariantError } from '../../../src/domain/errors/CrewRosterInvariantError.js';

function sampleLeads(): [CrewLead, CrewLead, CrewLead, CrewLead] {
  return [
    CrewLead.create('crew-ada', 'Ada Okonkwo'),
    CrewLead.create('crew-bao', 'Bao Chen'),
    CrewLead.create('crew-mira', 'Mira Santos'),
    CrewLead.create('crew-nio', 'Nia Ortiz'),
  ];
}

describe('CrewRoster', () => {
  it('accepts exactly three crew leads with unique ids', () => {
    const [ada, bao, mira] = sampleLeads();
    const roster = CrewRoster.of([ada, bao, mira]);

    expect(roster.leads).toHaveLength(3);
    expect(roster.has('crew-ada')).toBe(true);
    expect(roster.has('crew-unknown')).toBe(false);
    expect(roster.find('crew-bao')?.name).toBe('Bao Chen');
    expect(roster.find('crew-unknown')).toBeUndefined();
  });

  it.each([0, 1, 2, 4])('rejects a roster of %i crew leads', (count) => {
    const leads = sampleLeads().slice(0, count);
    expect(() => CrewRoster.of(leads)).toThrow(CrewRosterInvariantError);
    try {
      CrewRoster.of(leads);
    } catch (error) {
      expect(error).toBeInstanceOf(CrewRosterInvariantError);
      const invariant = error as CrewRosterInvariantError;
      expect(invariant.code).toBe('CREW_ROSTER_INVALID');
      expect(invariant.details).toEqual({ received: count });
      expect(invariant.message).toContain(`received ${count}`);
    }
  });

  it('rejects duplicate crew lead ids', () => {
    const [ada, bao] = sampleLeads();
    const duplicate = CrewLead.create('crew-ada', 'Ada Two');
    expect(() => CrewRoster.of([ada, bao, duplicate])).toThrow(CrewRosterInvariantError);
    try {
      CrewRoster.of([ada, bao, duplicate]);
    } catch (error) {
      const invariant = error as CrewRosterInvariantError;
      expect(invariant.message).toBe('Crew lead ids must be unique.');
      expect(invariant.details).toEqual({ ids: ['crew-ada', 'crew-bao', 'crew-ada'] });
    }
  });
});

describe('CrewLead', () => {
  it('trims id and name', () => {
    const lead = CrewLead.create('  crew-ada  ', '  Ada Okonkwo  ');
    expect(lead.id).toBe('crew-ada');
    expect(lead.name).toBe('Ada Okonkwo');
  });

  it('rejects a blank id', () => {
    expect(() => CrewLead.create('   ', 'Ada Okonkwo')).toThrow(/id must not be blank/);
  });

  it('rejects a blank or over-long name', () => {
    expect(() => CrewLead.create('crew-ada', '   ')).toThrow(/name must be between 1 and 100/);
    expect(() => CrewLead.create('crew-ada', 'A'.repeat(101))).toThrow(
      /name must be between 1 and 100/,
    );
  });

  it('accepts a 100 character name', () => {
    const name = 'A'.repeat(100);
    expect(CrewLead.create('crew-ada', name).name).toBe(name);
  });
});
