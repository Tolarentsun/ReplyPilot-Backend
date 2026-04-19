const db = require('./database');

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

const DEMO_REVIEWS = [
  { reviewer_name: 'Sarah Mitchell', rating: 5, review_text: 'Absolutely phenomenal experience from start to finish! The staff was incredibly attentive and the quality exceeded all my expectations. Will definitely be returning and recommending to friends and family.', review_date: '2024-12-15', sentiment: 'positive', sentiment_score: 0.96, keywords: JSON.stringify(['phenomenal', 'attentive', 'quality', 'recommend']), platform: 'google' },
  { reviewer_name: 'James Carter', rating: 4, review_text: 'Really good overall. The service was prompt and professional. Minor wait time at the start but once things got going it was smooth. Would come back.', review_date: '2024-12-12', sentiment: 'positive', sentiment_score: 0.72, keywords: JSON.stringify(['prompt', 'professional', 'wait time']), platform: 'google' },
  { reviewer_name: 'Linda Fernandez', rating: 2, review_text: 'Very disappointed with my visit. The wait was over 40 minutes and when I finally got help, the staff seemed disinterested. The product quality was okay but for the price, I expected much more.', review_date: '2024-12-10', sentiment: 'negative', sentiment_score: 0.18, keywords: JSON.stringify(['wait', 'disinterested', 'disappointed', 'price']), platform: 'google' },
  { reviewer_name: 'David Thompson', rating: 5, review_text: 'Best in the area, no question. Every time I visit the experience is consistently excellent. Knowledgeable team, clean facilities, and they really go the extra mile for their customers.', review_date: '2024-12-08', sentiment: 'positive', sentiment_score: 0.98, keywords: JSON.stringify(['best', 'consistent', 'knowledgeable', 'clean']), platform: 'google' },
  { reviewer_name: 'Angela Brooks', rating: 3, review_text: 'Decent place. Nothing particularly stood out as amazing but nothing was terrible either. The pricing seems a bit high compared to similar spots nearby. Average experience all around.', review_date: '2024-12-05', sentiment: 'neutral', sentiment_score: 0.50, keywords: JSON.stringify(['pricing', 'average', 'decent']), platform: 'google' },
  { reviewer_name: 'Michael Rodriguez', rating: 1, review_text: 'Terrible experience. Rude staff and the product was defective. When I tried to get a refund they made it extremely difficult. Will never return and will be warning others.', review_date: '2024-11-30', sentiment: 'negative', sentiment_score: 0.04, keywords: JSON.stringify(['rude', 'defective', 'refund', 'terrible']), platform: 'google' },
  { reviewer_name: 'Emily Watson', rating: 5, review_text: "Found this gem through a friend's recommendation and so glad I did! The atmosphere is wonderful and every team member is friendly and professional. Already booked my next visit!", review_date: '2024-11-28', sentiment: 'positive', sentiment_score: 0.94, keywords: JSON.stringify(['gem', 'friendly', 'professional', 'atmosphere']), platform: 'yelp' },
  { reviewer_name: 'Kevin Park', rating: 4, review_text: 'Great value for money. The team clearly knows what they are doing and takes pride in their work. Only thing I would improve is the parking situation. Otherwise 5 stars.', review_date: '2024-11-25', sentiment: 'positive', sentiment_score: 0.80, keywords: JSON.stringify(['value', 'parking', 'expertise']), platform: 'google' },
  { reviewer_name: 'Natalie Chen', rating: 5, review_text: "Five stars without hesitation. I've been a loyal customer for two years and the quality and service have never wavered. They truly care about their clients.", review_date: '2024-11-15', sentiment: 'positive', sentiment_score: 0.99, keywords: JSON.stringify(['loyal', 'quality', 'consistent', 'caring']), platform: 'google' },
  { reviewer_name: 'Robert Greene', rating: 2, review_text: "Mixed feelings. The initial consultation was great but the follow-through left a lot to be desired. Had to call three times to get an answer. Inconsistent.", review_date: '2024-11-18', sentiment: 'negative', sentiment_score: 0.28, keywords: JSON.stringify(['inconsistent', 'follow-through', 'consultation']), platform: 'facebook' },
];

async function seedDemoReviews(userId) {
  try {
    for (const review of DEMO_REVIEWS) {
      await db.asyncRun(
        `INSERT INTO reviews (id, user_id, platform, reviewer_name, rating, review_text, review_date, sentiment, sentiment_score, keywords, response_status, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'demo')`,
        [generateId(), userId, review.platform, review.reviewer_name, review.rating, review.review_text, review.review_date, review.sentiment, review.sentiment_score, review.keywords]
      );
    }
    console.log('✅ Demo reviews seeded for', userId);
  } catch(e) {
    console.error('Seed error:', e.message);
  }
}

module.exports = { seedDemoReviews };
