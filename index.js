// includes
if (!process.env.DEV) {
  require('newrelic');
}

const express = require('express');
const async = require('async');

const db = require('./components/database');
const dbConfig = require('./config/database');

const Comment = require('./components/comment');
const User = require('./models/user');
const { r, client } = require('./lib/reddit')();
const jobRunner = require('./components/scheduler');

const app = express();
const port = process.env.PORT || 8080;

// start up our db
db.init(dbConfig.url);

// run our weekly awards
jobRunner.run();

// reddit wrappers
const commentStream = client.CommentStream({
  subreddit: process.env.SUB,
  results: 20,
  pollTime: 2000,
});

commentStream.on('comment', async (comment) => {
  const parser = new Comment(comment.body, comment.id);
  const processedComment = await parser.processComment();
  // const reset = comment.body.includes('!hitTheButtonMichael');
  const reset = false;
  const reply = comment.body.includes('!tellMeMyScore');
  const replyString = (score, name) => {
    return `You have ${score} points, ${name}! \n\n This is an automated reply. You can view my code [here](https://github.com/rjschill87/theGoodPlaceBot).`;
  };

  User.findOrCreate(comment.author.name, (err, user) => {
    const score = reset ? 0 : parseInt(processedComment.polarity) + parseInt(user.score);

    User.findOneAndUpdate({ _id: user._id }, { $set: { score } }, { new: true })
      .exec()
      .then((updatedUser) => {
        // if the user wants to know how many points they have...
        if (reply) {
          r.getComment(comment.id).reply(replyString(score, updatedUser.username));
        }
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

// setup middleware
require('./middleware')(app);
// setup routes
require('./routes')(app, db, r);

app.listen(port, () => { console.log(`Now listening on port: ${port}`); });
