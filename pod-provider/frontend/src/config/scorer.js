import { createPasswordScorer, defaultPasswordScorerOptions } from '@semapps/auth-provider';

// Lower the minimum required score from 5 to 3
export default createPasswordScorer(defaultPasswordScorerOptions, 3);
