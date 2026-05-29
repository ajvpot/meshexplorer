#include <stdio.h>
#include <string.h>
#include <openssl/aes.h>
#include <openssl/hmac.h>
#include <openssl/sha.h>
#include <msgpack.h>

#define CIPHER_MAC_SIZE 2
#define CIPHER_KEY_SIZE 16
#define MAX_PAYLOAD 184

// Default "public" channel key
static const unsigned char public_channel_private_key[16] = {
    0x8B, 0x33, 0x87, 0xE5, 0xCD, 0xEA, 0x6A, 0xC9, 
    0xE5, 0xED, 0xBA, 0xA1, 0x15, 0xCD, 0x72, 0x0F
};

static int decrypt_msg(const unsigned char *key, const unsigned char *data, size_t len, unsigned char *out, size_t *out_len) {
    if (len <= CIPHER_MAC_SIZE) return 0;
    
    unsigned char mac[SHA256_DIGEST_LENGTH];
    HMAC(EVP_sha256(), key, CIPHER_KEY_SIZE, data + CIPHER_MAC_SIZE, 
         len - CIPHER_MAC_SIZE, mac, NULL);
    
    if (memcmp(mac, data, CIPHER_MAC_SIZE) != 0) return 0;
    
    AES_KEY aes_key;
    AES_set_decrypt_key(key, 128, &aes_key);
    
    size_t blocks = (len - CIPHER_MAC_SIZE) / 16;
    for (size_t i = 0; i < blocks; i++) {
        AES_decrypt(data + CIPHER_MAC_SIZE + (i * 16), out + (i * 16), &aes_key);
    }
    *out_len = blocks * 16;
    return 1;
}

int main() {
    unsigned char buf[8192];
    size_t len = fread(buf, 1, sizeof(buf), stdin);
    if (len == 0) return 0;
    
    msgpack_unpacked result;
    msgpack_unpacked_init(&result);
    
    size_t off = 0;
    msgpack_unpack_return ret = msgpack_unpack_next(&result, (char*)buf, len, &off);
    
    if (ret == MSGPACK_UNPACK_SUCCESS && result.data.type == MSGPACK_OBJECT_ARRAY) {
        msgpack_object_array arr = result.data.via.array;
        msgpack_sbuffer sbuf;
        msgpack_sbuffer_init(&sbuf);
        msgpack_packer pk;
        msgpack_packer_init(&pk, &sbuf, msgpack_sbuffer_write);
        
        msgpack_pack_array(&pk, arr.size);
        
        for (size_t i = 0; i < arr.size; i++) {
            msgpack_object row = arr.ptr[i];
            if (row.type == MSGPACK_OBJECT_ARRAY && row.via.array.size >= 3) {
                msgpack_object mac_obj = row.via.array.ptr[0];
                msgpack_object enc_obj = row.via.array.ptr[1];
                msgpack_object hash_obj = row.via.array.ptr[2];
                if (mac_obj.type == MSGPACK_OBJECT_STR && enc_obj.type == MSGPACK_OBJECT_STR && hash_obj.type == MSGPACK_OBJECT_STR && hash_obj.via.str.size > 0) {
                    // Concatenate mac + encrypted_data
                    size_t mac_len = mac_obj.via.str.size;
                    size_t enc_len = enc_obj.via.str.size;
                    unsigned char mac_and_enc[MAX_PAYLOAD];
                    if (mac_len + enc_len > MAX_PAYLOAD) { msgpack_pack_nil(&pk); continue; }
                    memcpy(mac_and_enc, mac_obj.via.str.ptr, mac_len);
                    memcpy(mac_and_enc + mac_len, enc_obj.via.str.ptr, enc_len);
                    unsigned char decrypted[MAX_PAYLOAD];
                    size_t decrypted_len;
                    if (decrypt_msg(public_channel_private_key, mac_and_enc, mac_len + enc_len, decrypted, &decrypted_len)) {
                        msgpack_pack_array(&pk, 2);
                        msgpack_pack_str(&pk, decrypted_len);
                        msgpack_pack_str_body(&pk, (char*)decrypted, decrypted_len);
                        unsigned char full_hash[SHA256_DIGEST_LENGTH];
                        SHA256(public_channel_private_key, CIPHER_KEY_SIZE, full_hash);
                        msgpack_pack_str(&pk, SHA256_DIGEST_LENGTH);
                        msgpack_pack_str_body(&pk, (char*)full_hash, SHA256_DIGEST_LENGTH);
                    } else {
                        msgpack_pack_nil(&pk);
                    }
                } else {
                    msgpack_pack_nil(&pk);
                }
            } else {
                msgpack_pack_nil(&pk);
            }
        }
        
        fwrite(sbuf.data, 1, sbuf.size, stdout);
        msgpack_sbuffer_destroy(&sbuf);
    }
    
    msgpack_unpacked_destroy(&result);
    return 0;
} 