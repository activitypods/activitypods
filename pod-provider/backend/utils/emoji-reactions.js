const SHORTCODE_BODY_RE = /^[A-Za-z0-9_+-]{1,64}$/;
const SHORTCODE_RE = /^:([A-Za-z0-9_+-]{1,64}):$/;
const EMOJI_GRAPHEME_RE = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})/u;

const LITEPUB_EMOJI_REACT_IRI = 'http://litepub.social/ns#EmojiReact';
const ACTIVITYSTREAMS_CONTEXT = 'https://www.w3.org/ns/activitystreams';
const LITEPUB_CONTEXT = {
  litepub: 'http://litepub.social/ns#',
  EmojiReact: 'litepub:EmojiReact',
};

const EMOJI_TYPE = 'Emoji';

const toArray = value => (Array.isArray(value) ? value : value ? [value] : []);

const splitGraphemes = input => {
  if (!input) {
    return [];
  }

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(input), item => item.segment);
  }

  return Array.from(input);
};

const isEmojiGrapheme = grapheme => EMOJI_GRAPHEME_RE.test(grapheme);

const normalizeShortcode = value => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const directMatch = trimmed.match(SHORTCODE_RE);
  if (directMatch) {
    return `:${directMatch[1]}:`;
  }

  if (SHORTCODE_BODY_RE.test(trimmed)) {
    return `:${trimmed}:`;
  }

  return null;
};

const normalizeUnicodeEmoji = value => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const graphemes = splitGraphemes(trimmed);
  if (graphemes.length !== 1) {
    return null;
  }

  return isEmojiGrapheme(graphemes[0]) ? graphemes[0] : null;
};

const normalizeEmojiReactionContent = value => {
  const shortcode = normalizeShortcode(value);
  if (shortcode) {
    return shortcode;
  }

  return normalizeUnicodeEmoji(value);
};

const isEmojiReactType = activity => {
  if (!activity || typeof activity !== 'object') {
    return false;
  }

  const types = toArray(activity.type || activity['@type']);
  return types.some(
    type => type === 'EmojiReact' || type === 'litepub:EmojiReact' || type === LITEPUB_EMOJI_REACT_IRI
  );
};

const isLikeType = activity => {
  if (!activity || typeof activity !== 'object') {
    return false;
  }

  const types = toArray(activity.type || activity['@type']);
  return types.some(type => type === 'Like' || type === 'as:Like' || type === 'https://www.w3.org/ns/activitystreams#Like');
};

const isEmojiReactionActivity = activity => {
  if (!activity || typeof activity !== 'object') {
    return false;
  }

  if (isEmojiReactType(activity)) {
    return true;
  }

  return isLikeType(activity) && typeof activity.content === 'string' && activity.content.trim().length > 0;
};

const ensureEmojiReactContext = activity => {
  if (!isEmojiReactType(activity)) {
    return activity;
  }

  const context = activity['@context'];
  const contexts = toArray(context);
  const hasAsContext = contexts.some(entry => entry === ACTIVITYSTREAMS_CONTEXT);
  const hasLitepub = contexts.some(entry => entry && typeof entry === 'object' && entry.EmojiReact);

  if (hasAsContext && hasLitepub) {
    return activity;
  }

  const nextContext = [...contexts];
  if (!hasAsContext) {
    nextContext.unshift(ACTIVITYSTREAMS_CONTEXT);
  }
  if (!hasLitepub) {
    nextContext.push(LITEPUB_CONTEXT);
  }

  return {
    ...activity,
    '@context': nextContext,
  };
};

const normalizeCustomEmojiTag = (tag, shortcode) => {
  if (!tag || typeof tag !== 'object') {
    return null;
  }

  const type = tag.type || tag['@type'];
  if (type !== EMOJI_TYPE) {
    return null;
  }

  const normalizedName = normalizeShortcode(tag.name || shortcode);
  if (!normalizedName || normalizedName.toLowerCase() !== shortcode.toLowerCase()) {
    return null;
  }

  return {
    ...tag,
    type: EMOJI_TYPE,
    name: shortcode,
  };
};

const normalizeEmojiReactionTags = (tags, shortcode) => {
  if (!shortcode) {
    return tags;
  }

  const tagList = toArray(tags);
  if (tagList.length !== 1) {
    return null;
  }

  const normalizedTag = normalizeCustomEmojiTag(tagList[0], shortcode);
  if (!normalizedTag) {
    return null;
  }

  return [normalizedTag];
};

const normalizeEmojiReactionActivity = activity => {
  if (!isEmojiReactionActivity(activity)) {
    return activity;
  }

  const normalizedContent = normalizeEmojiReactionContent(activity.content);
  if (!normalizedContent) {
    return activity;
  }

  const shortcode = normalizeShortcode(normalizedContent);
  const normalizedTags = normalizeEmojiReactionTags(activity.tag, shortcode);
  if (shortcode && !normalizedTags) {
    return activity;
  }

  let nextActivity = {
    ...activity,
    content: normalizedContent,
    tag: normalizedTags,
  };

  nextActivity = ensureEmojiReactContext(nextActivity);

  return nextActivity;
};

module.exports = {
  normalizeEmojiReactionContent,
  isEmojiReactionActivity,
  normalizeEmojiReactionActivity,
};