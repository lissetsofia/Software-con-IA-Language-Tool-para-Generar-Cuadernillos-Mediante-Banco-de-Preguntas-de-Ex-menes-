CREATE DATABASE mi_app;

USE mi_app;

CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    password VARCHAR(50) NOT NULL
);

INSERT INTO usuarios (username, password) VALUES ('admin', '1234');