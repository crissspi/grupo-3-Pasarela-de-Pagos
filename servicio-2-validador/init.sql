CREATE TABLE tarjetas (
    numero VARCHAR(12) PRIMARY KEY,
    cvc VARCHAR(4) NOT NULL,
    saldo NUMERIC NOT NULL
);

INSERT INTO tarjetas (numero, cvc, saldo) VALUES ('111122223333', '123', 500000); 
INSERT INTO tarjetas (numero, cvc, saldo) VALUES ('444455556666', '999', 1500);   