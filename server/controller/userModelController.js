const db = require('../data/userModel');
const fs = require('fs');
const fetch = require("node-fetch");

const userModelController = {};

//action whenever a new user signs up
userModelController.createUser = (req, res, next) => {
  const { username, password, age, state, education } = req.body;
  console.log('req.body: ', req.body);
  const text = `
    INSERT INTO usersfix (username, password, age, state, education, games_played, correct_answers)
    values($1, $2, $3, $4, $5, $6, $7)
  `;
  const values = [username, password, age, state, education, 0, 0];
  db.query(text, values)
    .then(response => console.log(response))
    .catch(err => console.log(err));
  return next();
};

//used for login verification
userModelController.findUser = (req, res, next) => {
  const { username, password } = req.body;
  console.log('req.body: ', req.body);
  const text = `
    SELECT username
    FROM usersfix
    WHERE username = '${username}' AND password = '${password}'
  `;
  db.query(text)
    .then(response => {
      //if the user doesn't exist or username/password is incorrect
      if (response.rows[0]) {
        console.log('User ', response.rows[0].username, ' has been verified through SQL DB');
        return next();
      } else {
        console.log('Username or password is invalid.');
        res.send('Invalid username or password. Please sign up or try again.');
      }
    })
    .catch(err => console.log(err));
};

// used to find games played and correct answers
userModelController.findStats = (req, res, next) => {
  const text = `
    SELECT games_played, correct_answers
    FROM usersfix
    WHERE username = '${req.params.username}'
  `;
  db.query(text)
    .then(response => {
      if (response.rows[0]) {
        console.log('User ', req.params.username, ' Games played: ', response.rows[0].games_played, ' Correct answers: ', response.rows[0].correct_answers);
        res.locals.stats = response.rows[0];
        return next();
      } else {
        console.log('Error occurred. Username is not sending properly.');
        res.send('Error occurred. Username is not sending properly.');
      }
    })
    .catch(err => console.log(err));
};

// Getting trivia questions depending on the category selected passed in params.url
userModelController.questions = async (req, res, next) => {
  const url = 'https://opentdb.com/api.php?amount=10&category=' + req.params.url + '&type=multiple';
  await fetch(url)
    .then(response => response.json())
    .then(data => {
      res.locals.results = data.results;
    })
    .catch(err => console.log(err));
  return next();
};

// Updating tables after finishing a game
userModelController.updateUser = (req, res, next) => {
  const { username, totalCorrectAnswers, currentCorrectAnswers, score, gamesPlayed, url } = req.body;

  // Updating rows: games_played and correct_answers from userfix table
  let sql = `
    UPDATE usersfix
    SET games_played = '${gamesPlayed}', correct_answers = '${totalCorrectAnswers}'
    WHERE username = '${username}'
  `;
   db.query(sql)
    .then(response => console.log(response))
    .catch(err => console.log(err));

  // Inserting a row into gamesplayed table
  sql = `
    INSERT INTO gamesplayed
    (username_fk, category_fk, correct_answers)
    VALUES ('${username}', ${url}, ${currentCorrectAnswers})
  `;
   db.query(sql)
    .then(response => console.log(response))
    .catch(err => console.log(err));
  return next();
};

userModelController.deleteUser = async (req, res, next) => {
  const { username } = req.body;
  const text = `
    DELETE FROM usersfix
    WHERE username = '${username}'
  `
  await db.query(text)
    .then(response => console.log(`${username} has been deleted`))
    .catch(err => console.log(err))
  return next();
};

///run this query to get average score of one educational level for one topic
userModelController.getGraphData = async(req, res, next) => {
  const { username } = req.params;

  // Getting all the categories from the database
  let row;
  let sql = `SELECT id FROM category`;
  await db.query(sql)
  .then(response => {
    row = response.rows;
  }).catch(err => console.log(err));

  // Getting score per category of username requested, 
  // response sent as res.locals.currentuser[category]
  let category;
  let count;
  let obj = {};
  for (let i = 0; i < row.length; i++){
    category = row[i].id;
    sql = `
      SELECT SUM(correct_answers), COUNT(*) 
      FROM gamesplayed 
      WHERE username_fk = '${username}' and category_fk = ${category}
   `;
    await db.query(sql)
    .then(resp => {
      count = Number(resp.rows[0].count);
      // Case no games played in that category
      if (count === 0) {
        obj[category] = 0
        // res.locals.currentuser = obj;
      }
      else {  
        obj[category] = (resp.rows[0].sum/(count*10))*100;
      }
      
    }).catch(err => console.log(err));
  }
  res.locals.currentuser = obj;

  // console.log("score: ",res.locals.currentuser);

  // Getting score per category of all games played except the username, 
  // response sent as res.locals.currentuser[education][category]
  category;
  count;
  let education = ['SE','BA','MA'];
  // obj = {};
  let obj1 = {};
  for (let j = 0; j < education.length; j++){
    obj = {}
  for (let i = 0; i < row.length; i++){
    category = row[i].id;
    sql = `
    SELECT SUM(correct_answers), COUNT(*) 
    FROM gamesplayed 
    WHERE category_fk = ${category} AND username_fk in 
      (
        SELECT username 
        FROM usersfix 
        WHERE education = '${education[j]}' AND username != '${username}'
      )
   `;
    await db.query(sql)
    .then(resp => {
      count = Number(resp.rows[0].count);
      console.log('in second query count =', count)
      // Case no games played in that category
      if (count === 0) {
        obj[category] = 0        
      }
      else {  
        obj[category] = (resp.rows[0].sum/(count*10))*100;
      }
    }).catch(err => console.log(err));
  }
     obj1[education[j]] = obj;    
  }
  res.locals.users = obj1;
  console.log("currentuser: ",res.locals.currentuser, "users: ", res.locals.users);
  return next();
};


userModelController.findLeaders = (req, res, next) => {
  const { username, totalCorrectAnswers, currentCorrectAnswers, score, gamesPlayed, url } = req.body;
  console.log('got into findLeaders');
  // const topic = req.params.topic;
  // const username = req.params.username;
  // const { id, username_fk, category_fk, score } = req.body;
  const text = `
  SELECT *
  FROM leaderboard
  `;
  db.query(text)
    .then (response =>{
      const usernames = [];
      const categories = [];
      const scores = [];
      for (let i = 0; i < response.rows.length; i++){
        let row = response.rows[i];
        usernames.push(row.username_fk);
        categories.push(row.category_fk);
        scores.push(row.score);
      }
      //console.log ('response.rows in leaderboard',response.rows)
      res.locals.usernames = usernames;
      res.locals.categories = categories;
      res.locals.scores = scores;
      //console.log('response from findLeaders: ', response);
    })
    .catch(err => console.log(err))
    return next();
}

module.exports = userModelController;
