import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Dumbbell, Scale, Sparkles, Target, Utensils } from 'lucide-react';
import { toDateKey } from '../lib/date';
import type { AppController } from '../state/useAppData';

interface OnboardingFlowProps { controller: AppController }

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function OnboardingFlow({ controller }: OnboardingFlowProps) {
  const { data } = controller;
  const [step, setStep] = useState(0);
  const [name, setName] = useState(data.profile.name);
  const [weight, setWeight] = useState('');
  const [goal, setGoal] = useState(String(data.profile.goalWeightKg));
  const [calories, setCalories] = useState(String(data.profile.calorieTarget));
  const [protein, setProtein] = useState(String(data.profile.proteinTarget));
  const [trainingDays, setTrainingDays] = useState(data.profile.trainingDays.length ? data.profile.trainingDays : ['Monday', 'Wednesday', 'Friday']);
  const [stepGoal, setStepGoal] = useState(String(data.coachingSettings.dailyStepGoal));
  if (data.onboardingCompleted) return null;

  const validBasics = name.trim().length > 0 && Number(weight) >= 30 && Number(weight) <= 300 && Number(goal) >= 40 && Number(goal) <= 200;
  const validTargets = Number(calories) >= 1200 && Number(calories) <= 6000 && Number(protein) >= 40 && Number(protein) <= 400;
  const validTraining = trainingDays.length >= 2 && trainingDays.length <= 5 && Number(stepGoal) >= 1000 && Number(stepGoal) <= 30000;
  const complete = () => {
    const profile = { ...data.profile, name: name.trim(), goalWeightKg: Number(goal), calorieTarget: Number(calories), proteinTarget: Number(protein), trainingDays };
    controller.saveWeight(toDateKey(), Number(weight));
    controller.completeOnboarding(profile, { ...data.coachingSettings, dailyStepGoal: Number(stepGoal) }, Number(weight));
  };

  return <div className="onboarding-backdrop" role="presentation"><section className="onboarding-shell" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
    <header><span className="brand-mark"><Sparkles size={18} /></span><div><p className="eyebrow">Project 75 setup</p><strong>Step {step + 1} of 3</strong></div><div className="onboarding-progress"><i style={{ width: `${(step + 1) / 3 * 100}%` }} /></div></header>
    <main>
      {step === 0 ? <div className="onboarding-step"><Scale size={31} /><p className="eyebrow">Starting point</p><h1 id="onboarding-title">Build the plan around real data</h1><p>Project 75 uses weight trends—not one-off scale readings—and protects strength while you move toward your target range.</p><div className="onboarding-grid"><label>Name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={100} /></label><label>Current weight<span className="unit-input"><input type="number" min="30" max="300" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} /><span>kg</span></span></label><label>Target weight<span className="unit-input"><input type="number" min="40" max="200" step="0.1" value={goal} onChange={(event) => setGoal(event.target.value)} /><span>kg</span></span></label></div></div> : null}
      {step === 1 ? <div className="onboarding-step"><Utensils size={31} /><p className="eyebrow">Nutrition baseline</p><h1 id="onboarding-title">Set targets you can actually test</h1><p>The coach will hold these steady until your logged food, weekly weight averages, and recovery signals justify one small change.</p><div className="onboarding-grid"><label>Daily calories<span className="unit-input"><input autoFocus type="number" min="1200" max="6000" step="10" value={calories} onChange={(event) => setCalories(event.target.value)} /><span>kcal</span></span></label><label>Daily protein<span className="unit-input"><input type="number" min="40" max="400" step="1" value={protein} onChange={(event) => setProtein(event.target.value)} /><span>g</span></span></label></div><div className="onboarding-principle"><Target size={17} /><span>Planned and fully logged days are separated, so incomplete food records never trigger an automatic calorie cut.</span></div></div> : null}
      {step === 2 ? <div className="onboarding-step"><Dumbbell size={31} /><p className="eyebrow">Strength and activity</p><h1 id="onboarding-title">Choose a sustainable weekly rhythm</h1><p>Three full-body sessions are the default. Pick two to five realistic days; missed sessions can be moved, shortened, or skipped without breaking the plan.</p><fieldset><legend>Training days</legend><div className="onboarding-days">{weekdays.map((day) => <button type="button" key={day} className={trainingDays.includes(day) ? 'selected' : ''} onClick={() => setTrainingDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day])}><span>{day.slice(0, 3)}</span>{trainingDays.includes(day) ? <Check size={15} /> : null}</button>)}</div></fieldset><label className="step-goal">Daily step goal<span className="unit-input"><input type="number" min="1000" max="30000" step="500" value={stepGoal} onChange={(event) => setStepGoal(event.target.value)} /><span>steps</span></span></label></div> : null}
    </main>
    <footer>{step > 0 ? <button type="button" className="secondary-button" onClick={() => setStep((value) => value - 1)}><ArrowLeft size={17} /> Back</button> : <span />}{step < 2 ? <button type="button" className="primary-button" disabled={step === 0 ? !validBasics : !validTargets} onClick={() => setStep((value) => value + 1)}>Continue <ArrowRight size={17} /></button> : <button type="button" className="primary-button" disabled={!validTraining} onClick={complete}><Check size={17} /> Start Project 75</button>}</footer>
  </section></div>;
}
