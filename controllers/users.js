const { StatusCodes } = require("http-status-codes");
const { BadRequestError } = require("../errors");
const sql = require("mssql");

const pool = require("../db/connection");

const usersTable = "datawayfinder";
const usersCollection = "users";
const usersSearchCollection = "userSearch";

const getUsers = async (req, res) => {
  try {
    const start = new Date().getTime();
    const poolResult = await pool;

    const request = poolResult.request();
    const { searchType, searchValue, limit = 20, offset, userId } = req.query;
    _validateSearch(searchType, searchValue, offset, userId);
    let queryStatement = "";
    queryStatement = _getQuery(searchType, limit, offset, searchValue);
    let countStatement = _getCountQuery(searchType, searchValue);
    const result = await request.query(queryStatement);
    const countResult = await request.query(countStatement);

    addSearchRecordToFirebase(searchType, searchValue, limit, userId, req);
    res
      .status(StatusCodes.OK)
      .json({ data: result.recordset, count: countResult.recordset[0][""] });
  } catch (error) {
    throw new BadRequestError("Something went wrong: " + error);
  }
};

async function addSearchRecordToFirebase(
  searchType,
  searchValue,
  limit,
  userId,
  req
) {
  const searchDoc = {
    searchType: searchType,
    searchValue: searchValue,
    limit: limit,
    userId: userId,
    createdAt: req.admin.firestore.Timestamp.now(),
  };
  const userRef = req.db.collection(usersCollection).doc(userId);

  await userRef.collection(usersSearchCollection).add(searchDoc);
}
function _getCountQuery(searchType, searchValue) {
  let queryStatement = "";
  switch (searchType) {
    case "name":
      queryStatement = `SELECT COUNT(*) FROM ${usersTable} WHERE name ='${searchValue}'`;
      break;
    case "address":
      queryStatement = `SELECT COUNT(*) FROM ${usersTable} WHERE address = '${searchValue}' OR postcode = '${searchValue}'`;
      break;

    case "phone":
      queryStatement = `SELECT COUNT(*) FROM ${usersTable} WHERE tel1 = '${searchValue}' OR tel2 = '${searchValue}' OR tel3 = '${searchValue}'`;
      break;

    case "ic":
      queryStatement = `SELECT COUNT(*) FROM ${usersTable} WHERE ic = '${searchValue}'`;
      break;

    default:
      throw new BadRequestError("Invalid search type");
  }
  return queryStatement;
}

function _getQuery(searchType, limit, offset, searchValue) {
  let queryStatement = "";
  switch (searchType) {
    case "name":
      // queryStatement = `SELECT TOP ${limit} * FROM ${usersTable} WHERE name ='${searchValue}'`;
      //implement pagination
      queryStatement = `SELECT * FROM ${usersTable} WHERE name ='${searchValue}' ORDER BY id OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;
      break;
    case "address":
      queryStatement = `SELECT TOP ${limit} * FROM ${usersTable} WHERE address = '${searchValue}' OR postcode = '${searchValue}'`;
      queryStatement = `SELECT * FROM ${usersTable} WHERE address = '${searchValue}' OR postcode = '${searchValue}' ORDER BY id OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;

      break;

    case "phone":
      queryStatement = `SELECT TOP ${limit} * FROM ${usersTable} WHERE tel1 = '${searchValue}' OR tel2 = '${searchValue}' OR tel3 = '${searchValue}'`;
      queryStatement = `SELECT * FROM ${usersTable} WHERE tel1 = '${searchValue}' OR tel2 = '${searchValue}' OR tel3 = '${searchValue}' ORDER BY id OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;
      break;

    case "ic":
      queryStatement = `SELECT TOP ${limit} * FROM ${usersTable} WHERE ic = '${searchValue}'`;
      queryStatement = `SELECT * FROM ${usersTable} WHERE ic = '${searchValue}' ORDER BY id OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;
      break;

    default:
      throw new BadRequestError("Invalid search type");
  }
  return queryStatement;
}

function _validateSearch(searchType, searchValue, offset, userId) {
  if (!searchType || !searchValue || !userId || !offset) {
    throw new BadRequestError("Invalid Request Parameters");
  }
}

const createUser = async (req, res) => {
  const { role, email, password } = req.body;
  const admin = req.admin;
  if (!role || !email || !password) {
    throw new BadRequestError("Please provide all required fields");
  } else {
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
    });

    await admin.auth().setCustomUserClaims(userRecord.uid, { role: role });

    res.status(StatusCodes.CREATED).json(userRecord);
  }
};

module.exports = { getUsers, createUser };
