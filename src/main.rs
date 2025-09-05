//! A service for ingesting and retrieving development events.
//!
//! This service provides a simple API to support an "Intelligent Development Tracker".
//! It can ingest arbitrary JSON events and store them in a database, and then
//! provide a list of all stored events.

use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Method, Request, Response, StatusCode, Server};
pub use mysql_async::prelude::*;
pub use mysql_async::*;
use std::convert::Infallible;
use std::net::SocketAddr;
use std::result::Result as StdResult;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

/// Retrieves the database connection URL from the environment or uses a default.
fn get_url() -> String {
    if let Ok(url) = std::env::var("DATABASE_URL") {
        let opts = Opts::from_url(&url).expect("DATABASE_URL invalid");
        if opts.db_name().expect("a database name is required").is_empty() {
            panic!("database name is empty");
        }
        url
    } else {
        "mysql://root:pass@127.0.0.1:3306/mysql".into()
    }
}

/// Represents a single development event to be tracked.
#[derive(Serialize, Deserialize, Debug, Clone)]
struct DevelopmentEvent {
    #[serde(default)]
    id: i32,
    timestamp: String,
    source: String,
    event_type: String,
    data: JsonValue,
}

// --- Custom Error Handling ---

#[derive(Debug)]
enum AppError {
    DbError(mysql_async::Error),
    JsonError(serde_json::Error),
    HyperError(hyper::Error),
    NotFound,
    Internal(String),
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

impl From<mysql_async::Error> for AppError {
    fn from(err: mysql_async::Error) -> Self { AppError::DbError(err) }
}
impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self { AppError::JsonError(err) }
}
impl From<hyper::Error> for AppError {
    fn from(err: hyper::Error) -> Self { AppError::HyperError(err) }
}

impl AppError {
    fn to_response(&self) -> Response<Body> {
        let (status, message) = match self {
            AppError::DbError(e) => {
                eprintln!("Database Error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Database error".to_string())
            }
            AppError::JsonError(e) => {
                eprintln!("JSON Error: {}", e);
                (StatusCode::BAD_REQUEST, "Invalid JSON format".to_string())
            }
            AppError::HyperError(e) => {
                eprintln!("Hyper Error: {}", e);
                (StatusCode::BAD_REQUEST, "Request body error".to_string())
            }
            AppError::NotFound => {
                (StatusCode::NOT_FOUND, "Not Found".to_string())
            }
            AppError::Internal(msg) => {
                eprintln!("Internal Server Error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
        };
        let body = serde_json::to_string(&ErrorResponse { error: message }).unwrap();
        Response::builder()
            .status(status)
            .header("Content-Type", "application/json")
            .body(Body::from(body))
            .unwrap()
    }
}

// --- Route Handlers ---

async fn route_request(req: Request<Body>, pool: Pool) -> Result<Response<Body>, AppError> {
    match (req.method(), req.uri().path()) {
        (&Method::OPTIONS, "/ingest") | (&Method::OPTIONS, "/events") => {
            Ok(response_build("{\"status\":\"ok\"}"))
        }
        (&Method::GET, "/") => {
            Ok(Response::new(Body::from("Development Event Tracker API")))
        }
        (&Method::GET, "/init") => {
            let mut conn = pool.get_conn().await?;
            "DROP TABLE IF EXISTS events;".ignore(&mut conn).await?;
            "CREATE TABLE events (id INT NOT NULL AUTO_INCREMENT, timestamp VARCHAR(255), source VARCHAR(255), event_type VARCHAR(255), data JSON, PRIMARY KEY (id));".ignore(&mut conn).await?;
            Ok(response_build("{\"status\":\"initialized\"}"))
        }
        (&Method::POST, "/ingest") => {
            let mut conn = pool.get_conn().await?;
            let byte_stream = hyper::body::to_bytes(req).await?;
            let event: DevelopmentEvent = serde_json::from_slice(&byte_stream)?;

            "INSERT INTO events (timestamp, source, event_type, data) VALUES (:timestamp, :source, :event_type, :data)"
                .with(params! {
                    "timestamp" => &event.timestamp,
                    "source" => &event.source,
                    "event_type" => &event.event_type,
                    "data" => serde_json::to_string(&event.data)?,
                })
                .ignore(&mut conn)
                .await?;

            let last_id = conn.last_insert_id()
                .ok_or_else(|| AppError::Internal("Could not retrieve last insert ID".to_string()))?;

            #[derive(Serialize)]
            struct IngestResponse {
                status: String,
                id: u64,
            }

            let res = IngestResponse {
                status: "ingested".to_string(),
                id: last_id,
            };

            Ok(response_build(&serde_json::to_string(&res)?))
        }
        (&Method::GET, "/events") => {
            let mut conn = pool.get_conn().await?;
            let query_params_map: std::collections::HashMap<String, String> = req.uri().query().map(|v| {
                url::form_urlencoded::parse(v.as_bytes()).into_owned().collect()
            }).unwrap_or_default();

            let mut query = "SELECT id, timestamp, source, event_type, data FROM events".to_string();
            let mut where_clauses = Vec::new();
            let mut params = Vec::new();

            if let Some(s) = query_params_map.get("source").filter(|s| !s.is_empty()) {
                where_clauses.push("source = :source");
                params.push(("source", s.clone()));
            }
            if let Some(t) = query_params_map.get("event_type").filter(|t| !t.is_empty()) {
                where_clauses.push("event_type = :event_type");
                params.push(("event_type", t.clone()));
            }

            if !where_clauses.is_empty() {
                query.push_str(" WHERE ");
                query.push_str(&where_clauses.join(" AND "));
            }
            query.push_str(" ORDER BY timestamp DESC");

            let events: Vec<DevelopmentEvent> = query
                .with(params.into_iter())
                .map(&mut conn, |(id, timestamp, source, event_type, data_str): (i32, String, String, String, String)| {
                    DevelopmentEvent {
                        id, timestamp, source, event_type,
                        data: serde_json::from_str(&data_str).unwrap_or(JsonValue::Null),
                    }
                }).await?;

            Ok(response_build(&serde_json::to_string(&events)?))
        }
        _ => Err(AppError::NotFound),
    }
}

/// Top-level request handler that wraps the routing logic to handle errors.
async fn handle_request(req: Request<Body>, pool: Pool) -> StdResult<Response<Body>, Infallible> {
    match route_request(req, pool).await {
        Ok(response) => Ok(response),
        Err(e) => Ok(e.to_response()),
    }
}

/// Builds a successful HTTP response with common headers.
fn response_build(body: &str) -> Response<Body> {
    Response::builder()
        .status(StatusCode::OK)
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        .header("Access-Control-Allow-Headers", "api,Keep-Alive,User-Agent,Content-Type")
        .header("Content-Type", "application/json")
        .body(Body::from(body.to_owned()))
        .unwrap()
}

/// The main entry point for the application.
#[tokio::main(flavor = "current_thread")]
async fn main() -> StdResult<(), Box<dyn std::error::Error + Send + Sync>> {
    let opts = Opts::from_url(get_url().as_str()).unwrap();
    let builder = OptsBuilder::from_opts(opts);
    let constraints = PoolConstraints::new(5, 10).unwrap();
    let pool_opts = PoolOpts::default().with_constraints(constraints);
    let pool = Pool::new(builder.pool_opts(pool_opts));

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    let make_svc = make_service_fn(|_| {
        let pool = pool.clone();
        async move {
            Ok::<_, Infallible>(service_fn(move |req| {
                handle_request(req, pool.clone())
            }))
        }
    });

    let server = Server::bind(&addr).serve(make_svc);
    println!("Listening on http://{}", addr);

    if let Err(e) = server.await {
        eprintln!("server error: {}", e);
    }
    Ok(())
}
