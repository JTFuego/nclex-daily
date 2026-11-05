# How NCLEX Daily's tags were assigned

These tags are approximations written for this app, not official NCLEX labels. No nursing educator has reviewed them. NCLEX doesn't publish a category for any question, so a real exam item could be classified differently.

## Test plan category

Each question has one category, based on what it mainly asks you to do:

- **Management of Care:** prioritizing clients, delegation, consent, advocacy, legal and ethical duties, and communication.
- **Safety and Infection Control:** infection precautions, restraints, fall prevention, fire and disaster response, and preventing errors.
- **Health Promotion and Maintenance:** growth and development, normal pregnancy and newborn care, screening, vaccines, and expected aging.
- **Psychosocial Integrity:** mental health conditions, therapeutic communication, substance use, abuse, and coping.
- **Basic Care and Comfort:** mobility, assistive devices, nutrition, elimination, and comfort.
- **Pharmacological and Parenteral Therapies:** medications, dose calculations, IV therapy, and blood products.
- **Reduction of Risk Potential:** lab values, diagnostic tests, treatment and device complications, and monitoring for problems.
- **Physiological Adaptation:** recognizing and managing illness, fluid and electrolyte problems, and medical emergencies.

Topic doesn't decide the category. A pediatric medication question counts as Pharmacological, for example. Each case study has one category for the whole case.

## Clinical judgment step

Each step reflects what the question asks you to do. A question that's mainly about recalling a fact has no step.

- **Recognize Cues:** which findings matter?
- **Analyze Cues:** what do the findings mean, or which condition fits them?
- **Prioritize Hypotheses:** which client or problem is most urgent?
- **Generate Solutions:** which care or treatment should be planned or expected?
- **Take Actions:** what should the nurse do, or do first, or teach?
- **Evaluate Outcomes:** did teaching or treatment work?

Bowties and case studies cover several steps, but each has only one tag: the step it mainly tests, which is usually Analyze Cues.

## Judgment calls to review

These 49 questions could reasonably fit either category. To change one, find its ID in `data/questions/` and edit its `testPlan` value.

| Question | What it asks | Category I chose | Other reasonable category |
| --- | --- | --- | --- |
| `card-004` | A client with heart failure gains 3 lb overnight. What should the nurse teach the client to do when this happens at home? | Physiological Adaptation | Health Promotion and Maintenance |
| `card-008` | Which statement shows a client understands teaching about a low-sodium diet for hypertension? | Basic Care and Comfort | Health Promotion and Maintenance |
| `card-016` | Which interventions help a client with venous insufficiency? | Physiological Adaptation | Basic Care and Comfort |
| `card-019` | Which instructions should the nurse give a client with a new permanent pacemaker? | Reduction of Risk Potential | Physiological Adaptation |
| `card-024` | A client who had cardiac surgery yesterday has this note. Select the findings that suggest cardiac tamponade. | Physiological Adaptation | Reduction of Risk Potential |
| `fe-004` | A client's sodium is 118 mEq/L. Which precaution has the highest priority? | Physiological Adaptation | Safety and Infection Control |
| `fe-014` | Which treatments are used to manage a dangerously high serum potassium? | Physiological Adaptation | Pharmacological and Parenteral Therapies |
| `fund-003` | The nurse finds a shallow, open, pink wound bed over a client's sacrum with no slough. How should this pressure injury be documented? | Physiological Adaptation | Basic Care and Comfort |
| `fund-005` | A newly placed, blind-inserted nasogastric feeding tube is ready for use. What is the most accurate way to confirm placement before the first feeding? | Reduction of Risk Potential | Basic Care and Comfort |
| `fund-008` | A client on bed rest for 3 days wants to walk to the bathroom. Which nursing action best prevents injury from orthostatic hypotension? | Basic Care and Comfort | Reduction of Risk Potential |
| `fund-015` | Which interventions help prevent pressure injuries in a client who is immobile? | Basic Care and Comfort | Reduction of Risk Potential |
| `fund-016` | Which complications is a client at higher risk for during prolonged immobility? | Reduction of Risk Potential | Basic Care and Comfort |
| `fund-023` | A 78-year-old taking a new diuretic reports dizziness when getting up. Lying BP is 132/78 mm Hg with HR 82. Standing BP is 104/62 mm Hg with HR 104. Complete the bowtie. | Reduction of Risk Potential | Basic Care and Comfort |
| `fund-024` | The nurse reviews this note on a client 4 days after abdominal surgery. Select the findings that suggest a wound infection. | Reduction of Risk Potential | Physiological Adaptation |
| `lead-005` | During a mass casualty event using START triage, which tag fits a client who is not breathing after the airway is opened? | Safety and Infection Control | Management of Care |
| `lead-006` | Which injury would be tagged red in a mass casualty triage? | Safety and Infection Control | Management of Care |
| `lead-010` | A nurse gives a medication to the wrong client. What should the nurse do first? | Safety and Infection Control | Management of Care |
| `lead-018` | Which actions support a culture of safety? | Safety and Infection Control | Management of Care |
| `lead-021` | Assign each client a START triage category. | Safety and Infection Control | Management of Care |
| `lead-023` | A client 1 day after abdominal surgery has a temperature of 102.2 F (39 C), HR 124/min, RR 28/min, BP 84/50 mm Hg, and new confusion. Lactate is 4.4 mmol/L. Complete the bowtie. | Physiological Adaptation | Management of Care |
| `mat-001` | The nurse sees repeated late decelerations during oxytocin-augmented labor. What should the nurse do first? | Reduction of Risk Potential | Health Promotion and Maintenance |
| `mat-008` | Why is vitamin K given to a newborn shortly after birth? | Health Promotion and Maintenance | Pharmacological and Parenteral Therapies |
| `mat-010` | An Rh-negative client gives birth to an Rh-positive newborn. When should Rho(D) immune globulin be given? | Pharmacological and Parenteral Therapies | Health Promotion and Maintenance |
| `mat-015` | Which complications are linked with poorly controlled gestational diabetes? | Health Promotion and Maintenance | Physiological Adaptation |
| `mat-018` | Which actions are appropriate for variable decelerations caused by cord compression? | Reduction of Risk Potential | Health Promotion and Maintenance |
| `mat-025` | The nurse is caring for a 28-year-old at 39 weeks in active labor receiving oxytocin. | Reduction of Risk Potential | Pharmacological and Parenteral Therapies |
| `ms-002` | A client had a total thyroidectomy today. Which finding requires the most immediate action? | Reduction of Risk Potential | Physiological Adaptation |
| `ms-004` | A client had an ischemic stroke with onset 90 minutes ago. Which question matters most when considering alteplase? | Pharmacological and Parenteral Therapies | Reduction of Risk Potential |
| `ms-007` | A client with cirrhosis is confused and has a flapping tremor of the hands. Which medication should the nurse expect? | Pharmacological and Parenteral Therapies | Physiological Adaptation |
| `ms-009` | Which diet instruction is most appropriate for a client with acute pancreatitis during the initial phase of severe pain? | Basic Care and Comfort | Physiological Adaptation |
| `ms-011` | A client on peritoneal dialysis has cloudy effluent and abdominal pain. What should the nurse suspect? | Reduction of Risk Potential | Physiological Adaptation |
| `ms-013` | A client receiving chemotherapy has an absolute neutrophil count of 400/mm3. Which precaution is most appropriate? | Safety and Infection Control | Reduction of Risk Potential |
| `ms-016` | Which instructions help prevent dislocation after a posterior-approach total hip replacement? | Reduction of Risk Potential | Basic Care and Comfort |
| `ms-017` | Which teaching helps a client manage gastroesophageal reflux disease? | Basic Care and Comfort | Physiological Adaptation |
| `ms-022` | Complete the statement about diabetes care. | Physiological Adaptation | Pharmacological and Parenteral Therapies |
| `mh-007` | Which vitamin is given to prevent Wernicke's encephalopathy in a client with alcohol use disorder? | Psychosocial Integrity | Pharmacological and Parenteral Therapies |
| `mh-009` | A client with anorexia nervosa begins refeeding. Which lab finding is the greatest concern? | Physiological Adaptation | Psychosocial Integrity |
| `mh-012` | Which plan best meets nutrition needs for a client in acute mania? | Psychosocial Integrity | Basic Care and Comfort |
| `ped-015` | Which care applies to an infant with RSV bronchiolitis? | Physiological Adaptation | Safety and Infection Control |
| `ped-017` | Which safety measures should be taught to parents of a toddler? | Safety and Infection Control | Health Promotion and Maintenance |
| `ped-018` | Which vaccines are live and generally contraindicated in a severely immunocompromised child? | Health Promotion and Maintenance | Pharmacological and Parenteral Therapies |
| `ped-024` | The nurse reviews a note on a 2-year-old brought in with a burn. Select the findings that raise concern for abuse. | Psychosocial Integrity | Management of Care |
| `resp-004` | A client with severe COPD and chronic CO2 retention is becoming hypoxic. What is the best approach to oxygen therapy? | Physiological Adaptation | Pharmacological and Parenteral Therapies |
| `resp-006` | A client's chest tube accidentally comes out of the chest. What should the nurse do first? | Reduction of Risk Potential | Physiological Adaptation |
| `resp-007` | Which finding in a chest tube drainage system should the nurse report? | Reduction of Risk Potential | Physiological Adaptation |
| `resp-013` | What result indicates a positive tuberculin skin test for a client living in a long-term care facility? | Reduction of Risk Potential | Health Promotion and Maintenance |
| `resp-017` | Which interventions help prevent hospital-acquired pneumonia? | Safety and Infection Control | Reduction of Risk Potential |
| `resp-021` | For each oxygen device, identify the approximate maximum oxygen delivery. | Physiological Adaptation | Pharmacological and Parenteral Therapies |
| `resp-022` | Complete the statement about peak flow self-management. | Physiological Adaptation | Health Promotion and Maintenance |
