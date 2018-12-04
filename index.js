// includes
const snoowrap = require('snoowrap');
const snoostorm = require('snoostorm');
const async = require('async');

const db = require('./components/database');
const dbConfig = require('./config/database');

const Comment = require('./components/comment');
const User = require('./models/user');


// start up our db
db.init(dbConfig.url);

// reddit config
const sub = 'theGoodPlace';
const config = {
  userAgent: 'GoodPlaceBot',
  clientId: process.env.ID,
  clientSecret: process.env.SECRET,
  username: process.env.USERNAME,
  password: process.env.PASS,
};

// reddit wrappers
const r = new snoowrap(config);
const client = new snoostorm(r);

const commentStream = client.CommentStream({
  subreddit: sub,
  results: 20,
  pollTime: 2000,
});

commentStream.on('comment', (comment) => {
  const parser = new Comment(comment.body, comment.id);
  const reset = comment.body.includes('!hitTheButtonMichael');
  const reply = comment.body.includes('!tellMeMyScore');

  parser.processComment()
    .then((data) => {
      User.findOrCreate({ username: comment.author.name }, (err, user) => {
        const score = reset ? 0 : data.polarity + user.score;

        User.findOneAndUpdate({ _id: user._id }, { $set: { score } }, { new: true })
          .exec()
          .then((updatedUser) => {
            // if the user wants to know how many points they have...
            if (reply) {
              const newScore = updatedUser.score;
              r.getComment(comment.id).reply(`You have ${newScore} points, ${comment.author.name}!`);
            }
          });
      });
    });
});

const fetchScoreboard = () => {
  async.parallel({
    highest: (callback) => {
      User.getTen(1, callback);
    },
    lowest: (callback) => {
      User.getTen(-1, callback);
    },
  }, (err, scoreboard) => {
    if (err) throw err;
    console.log('>>> scoreboard', scoreboard);
  });
};